import { NextResponse } from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'
import fetch from 'node-fetch'

const systemPrompt = `
You are a rate my professor agent to help students find classes, that takes in user questions and answers them.
For every user question, the top 3 professors that match the user question are returned.
Use them to answer the question if needed.
`

export async function POST(req: Request) {
  const data = await req.json()

  const apiKey = process.env.NEXT_PUBLIC_PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY is not set in environment variables');
  }
  const pc = new Pinecone({ apiKey });

  const index = pc.index('rag').namespace('ns1')

  const text = data[data.length - 1].content

  // Fetch embedding using Cohere
  const cohereResponse = await fetch('https://api.cohere.ai/v1/embed', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_COHERE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      texts: [text],
      model: 'embed-english-v3.0',
      input_type: 'search_query',
    }),
  })
  const cohereData = await cohereResponse.json()
  const embedding = cohereData.embeddings[0]

  // Query Pinecone index
  const results = await index.query({
    topK: 3,
    includeMetadata: true,
    vector: embedding,
  })

  let resultString = ''
  results.matches.forEach((match) => {
    resultString += `
    Returned Results:
    Professor: ${match.id}
    Review: ${match.metadata?.review}
    Subject: ${match.metadata?.subject}
    Stars: ${match.metadata?.stars}
    \n\n`
  })

  const lastMessage = data[data.length - 1]
  const lastMessageContent = lastMessage.content + resultString
  const lastDataWithoutLastMessage = data.slice(0, data.length - 1)

  // Fetch chat completion from OpenRouter API
  const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://your-site-url.com',
      'X-Title': 'Rate My Professor App',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      messages: [
        { role: 'system', content: systemPrompt },
        ...lastDataWithoutLastMessage,
        { role: 'user', content: lastMessageContent },
      ],
      top_p: 1,
      temperature: 0.9,
      frequency_penalty: 0,
      presence_penalty: 0,
      repetition_penalty: 1,
      top_k: 0,
    }),
  })

  // Stream response from OpenRouter
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        if (openRouterResponse.body) {
          for await (const chunk of openRouterResponse.body) {
            const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8'); // Convert Buffer to string
            controller.enqueue(encoder.encode(text))
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream)
}
