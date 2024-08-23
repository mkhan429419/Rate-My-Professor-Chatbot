import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";
import { HfInference } from "@huggingface/inference";

// Initialize Hugging Face Inference API client with the correct API key
const hf = new HfInference(process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY);

// Initialize Groq client with the API key
const groq = new Groq({
  apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY || "",
});

const systemPrompt = `
You are a rate my professor agent designed to assist students with their questions about professors and classes. Use the provided data to accurately answer each question, focusing on the information available. 
`;

export async function POST(req: NextRequest) {
  const data = await req.json();
  const text = data[data.length - 1].content;

  try {
    // Generate embeddings using Hugging Face Inference API
    const embeddingsResponse = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: text,
    });

    // Ensure embeddingsResponse is of type number[][]
    const embeddings = Array.isArray(embeddingsResponse[0])
      ? (embeddingsResponse[0] as number[][]).flat()
      : (embeddingsResponse as number[]);

    // Initialize Pinecone
    const pc = new Pinecone({
      apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY || "",
    });

    if (!process.env.NEXT_PUBLIC_PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY is not defined");
    }

    const index = pc.index("rag2").namespace("ns1");

    // Query Pinecone for similar embeddings
    const results = await index.query({
      topK: 40,
      includeMetadata: true,
      vector: embeddings,
    });

    // Organize results by professor and create a response string
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
          professors[professorName].department =
            match.metadata.department || "N/A";
          professors[professorName].school = match.metadata.school || "N/A";
          professors[professorName].overall_quality =
            match.metadata.overall_quality || "N/A";
          professors[professorName].number_of_ratings =
            match.metadata.number_of_ratings || "N/A";
          professors[professorName].would_take_again_percentage =
            match.metadata.would_take_again_percentage || "N/A";
          professors[professorName].level_of_difficulty =
            match.metadata.level_of_difficulty || "N/A";
          professors[professorName].top_tags = Array.isArray(
            match.metadata.top_tags
          )
            ? match.metadata.top_tags
            : [];
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
  } catch (error) {
    console.error("Error during POST request:", error);
    return NextResponse.json(
      { error: "An error occurred while processing your request." },
      { status: 500 }
    );
  }
}
