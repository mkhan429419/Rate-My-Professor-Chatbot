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

  // Explicitly assert that embeddings is of type number[][]
  const embeddings = cohereResponse.embeddings as number[][];

  if (!embeddings || embeddings.length === 0) {
    throw new Error("Failed to generate embeddings");
  }

  const embedding = embeddings[0];

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
    topK: 1000, // Increase topK to ensure you retrieve enough results
    includeMetadata: true,
    vector: embedding,
  });

  // Organize results by professor
  const professors: Record<string, any> = {};

  results.matches.forEach((match) => {
    if (match.metadata) {
      const professorName = match.metadata.professor_name as string;

      if (!professors[professorName]) {
        professors[professorName] = {
          name: professorName,
          department: "N/A",
          school: "N/A",
          overall_quality: "N/A",
          number_of_ratings: "N/A",
          would_take_again_percentage: "N/A",
          level_of_difficulty: "N/A",
          top_tags: [],
          reviews: [],
        };
      }

      if (match.metadata.type === "professor_info") {
        // Populate professor's general information if not already set
        professors[professorName].department = match.metadata.department || "N/A";
        professors[professorName].school = match.metadata.school || "N/A";
        professors[professorName].overall_quality = match.metadata.overall_quality || "N/A";
        professors[professorName].number_of_ratings = match.metadata.number_of_ratings || "N/A";
        professors[professorName].would_take_again_percentage = match.metadata.would_take_again_percentage || "N/A";
        professors[professorName].level_of_difficulty = match.metadata.level_of_difficulty || "N/A";
        professors[professorName].top_tags = Array.isArray(match.metadata.top_tags) ? match.metadata.top_tags : [];
      }

      if (match.metadata.type === "review") {
        professors[professorName].reviews.push({
          subject: match.metadata.subject || "N/A",
          date: match.metadata.date || "N/A",
          quality: match.metadata.quality || "N/A",
          difficulty: match.metadata.difficulty || "N/A",
          review: match.metadata.review || "N/A",
          tags: Array.isArray(match.metadata.tags) ? match.metadata.tags : [],
        });
      }
    }
  });

  // Construct the result string based on the organized data
  let resultString =
    "Based on the provided information, the following professors are available:\n\n";
  Object.values(professors).forEach((prof: any) => {
    resultString += `
    Professor: ${prof.name} (${prof.overall_quality}/5)
    Department: ${prof.department}, ${prof.school}
    Overall Quality: ${prof.overall_quality || "N/A"}
    Number of Ratings: ${prof.number_of_ratings || "N/A"}
    Would Take Again: ${prof.would_take_again_percentage || "N/A"}%
    Level of Difficulty: ${prof.level_of_difficulty || "N/A"}
    Top Tags: ${prof.top_tags.length > 0 ? prof.top_tags.join(", ") : "N/A"}

    Reviews:
    `;
    prof.reviews.forEach((review: any, index: number) => {
      resultString += `
      ${index + 1}. Course: ${review.subject} (${review.date})
      Review Quality: ${review.quality}
      Review Difficulty: ${review.difficulty}
      Review: ${review.review}
      Tags: ${review.tags.length > 0 ? review.tags.join(", ") : "N/A"}
      \n`;
    });
    resultString += "\n";
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
