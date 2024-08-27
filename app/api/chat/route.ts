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
You have access to metadata such as professor name, department, school, overall quality, number of ratings, would take again percentage, level of difficulty, top tags, and reviews.
Respond to questions by providing the most relevant information based on the metadata provided. Be aware of synonyms and variations in how users might ask questions.
`;

export async function POST(req: NextRequest) {
  const data = await req.json();
  const text = data[data.length - 1].content.trim().toLowerCase();

  try {
    // Generate embeddings using Hugging Face Inference API
    const embeddingsResponse = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: text,
    });

    const embeddings = Array.isArray(embeddingsResponse[0])
      ? (embeddingsResponse[0] as number[][]).flat()
      : (embeddingsResponse as number[]);

    if (!embeddings || embeddings.length === 0) {
      throw new Error("Invalid embeddings received from Hugging Face.");
    }

    // Initialize Pinecone
    const pc = new Pinecone({
      apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY || "",
    });

    const index = pc.index("rag4").namespace("ns1");

    // Query Pinecone for similar embeddings
    const results = await index.query({
      topK: 10,
      includeMetadata: true,
      vector: embeddings,
    });

    let resultString = "Here is the relevant information:\n\n";

    results.matches.forEach((match) => {
      if (match.metadata && match.metadata.type === "professor_info") {
        const professorInfo = match.metadata as {
          professor_name: string;
          department: string;
          school: string;
          overall_quality: number;
          number_of_ratings: number;
          would_take_again_percentage: string;
          level_of_difficulty: string;
          top_tags: string[];
          reviews: string[];
        };

        // Dynamically generate a response based on the user's question and synonyms
        if (
          text.includes("name") ||
          text.includes("who is") ||
          text.includes("professor")
        ) {
          resultString += `Professor Name: ${professorInfo.professor_name}\n`;
        }
        if (
          text.includes("department") ||
          text.includes("faculty") ||
          text.includes("division")
        ) {
          resultString += `Department: ${professorInfo.department}\n`;
        }
        if (
          text.includes("school") ||
          text.includes("university") ||
          text.includes("college")
        ) {
          resultString += `School: ${professorInfo.school}\n`;
        }
        if (
          text.includes("overall quality") ||
          text.includes("rating") ||
          text.includes("score")
        ) {
          resultString += `Overall Quality: ${professorInfo.overall_quality}/5\n`;
        }
        if (
          text.includes("number of ratings") ||
          text.includes("ratings") ||
          text.includes("reviews count")
        ) {
          resultString += `Number of Ratings: ${professorInfo.number_of_ratings}\n`;
        }
        if (
          text.includes("would take again") ||
          text.includes("take again") ||
          text.includes("repeat students")
        ) {
          resultString += `Would Take Again: ${professorInfo.would_take_again_percentage}%\n`;
        }
        if (
          text.includes("difficulty") ||
          text.includes("level of difficulty") ||
          text.includes("challenge")
        ) {
          resultString += `Level of Difficulty: ${professorInfo.level_of_difficulty}\n`;
        }
        if (text.includes("tags") || text.includes("top tags")) {
          resultString += `Top Tags: ${professorInfo.top_tags.length > 0 ? professorInfo.top_tags.join(", ") : "N/A"}\n`;
        }
        if (text.includes("reviews") || text.includes("feedback")) {
          resultString += `Reviews: ${professorInfo.reviews.length > 0 ? professorInfo.reviews.join(" | ") : "No reviews available"}\n`;
        }
      }
    });

    const lastMessageContent = data[data.length - 1].content + resultString;
    const messages = [
      { role: "system", content: systemPrompt },
      ...data.slice(0, data.length - 1),
      { role: "user", content: lastMessageContent },
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: "llama3-8b-8192",
      stream: false,
    });

    if (completion && completion.choices && completion.choices[0]) {
      const content = completion.choices[0].message?.content || "";
      return new NextResponse(content);
    }

    throw new Error("No valid completion response received.");
  } catch (error) {
    console.error("Error during POST request:", error);
    return NextResponse.json(
      { error: "An error occurred while processing your request." },
      { status: 500 }
    );
  }
}
