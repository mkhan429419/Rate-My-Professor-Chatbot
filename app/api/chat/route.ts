import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";
import { CohereClient } from "cohere-ai";

// Initialize Cohere client
const cohere = new CohereClient({
  token: process.env.NEXT_PUBLIC_COHERE_API_KEY || "",
});

// Initialize Groq client with the API key
const groq = new Groq({
  apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY || "",
});

const systemPrompt = `
You are a rate my professor agent to help students find classes, that takes in user questions and answers them.
For every user question, the top 3 professors that match the user question are returned.
Use them to answer the question if needed.
`;

export async function POST(req: NextRequest) {
  const data = await req.json();
  const text = data[data.length - 1].content;

  // Generate embeddings using Cohere
  const cohereResponse = await cohere.embed({
    texts: [text],
    model: "embed-english-v3.0",
    inputType: "search_query",
  });

  // Assert that embeddings is of type number[][]
  const embedding = (cohereResponse.embeddings as number[][])[0];

  // Initialize Pinecone
  const pc = new Pinecone({
    apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY || "",
  });

  if (!process.env.NEXT_PUBLIC_PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY is not defined");
  }

  const index = pc.index("rag").namespace("ns1");

  // Query Pinecone for similar embeddings
  const results = await index.query({
    topK: 5,
    includeMetadata: true,
    vector: embedding,
  });

  // Construct the result string
  let resultString = "";
  results.matches.forEach((match) => {
    if (match.metadata) {
      resultString += `
      Returned Results:
      Professor: ${match.id}
      Review: ${match.metadata.review}
      Subject: ${match.metadata.subject}
      Stars: ${match.metadata.stars}
      \n\n`;
    }
  });

  const lastMessage = data[data.length - 1];
  const lastMessageContent = lastMessage.content + resultString;
  const lastDataWithoutLastMessage = data.slice(0, data.length - 1);

  // Use Groq for generating a chat completion based on the retrieved results
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      ...lastDataWithoutLastMessage,
      { role: "user", content: lastMessageContent },
    ],
    model: "llama3-8b-8192",
    stream: true,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            const text = encoder.encode(content);
            controller.enqueue(text);
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
  return new NextResponse(stream);
}
