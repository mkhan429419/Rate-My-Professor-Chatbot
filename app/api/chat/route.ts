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
Respond to questions by providing the most relevant information based on the metadata provided.
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

    // Process the results and structure the response
    let resultString = "Based on the provided information, the following professors are available:\n\n";

    results.matches.forEach((match) => {
      if (match.metadata) {
        const professorName = match.metadata.professor_name as string;
        const overallQuality = match.metadata.overall_quality as number;
        const numberOfRatings = match.metadata.number_of_ratings as number;
        const wouldTakeAgainPercentage = match.metadata.would_take_again_percentage as string;
        const levelOfDifficulty = match.metadata.level_of_difficulty as string;
        const topTags = match.metadata.top_tags as string[];
        const reviews = match.metadata.reviews as string[];

        resultString += `
        Professor: ${professorName} (${overallQuality}/5)
        Department: ${match.metadata.department || "N/A"}, ${match.metadata.school || "N/A"}
        Overall Quality: ${overallQuality || "N/A"}
        Number of Ratings: ${numberOfRatings || "N/A"}
        Would Take Again: ${wouldTakeAgainPercentage || "N/A"}%
        Level of Difficulty: ${levelOfDifficulty || "N/A"}
        Top Tags: ${Array.isArray(topTags) && topTags.length > 0 ? topTags.join(", ") : "N/A"}

        Reviews:
        ${Array.isArray(reviews) && reviews.length > 0 ? reviews.join(" | ") : "No reviews available."}
        `;
      }
    });

    const lastMessageContent = data[data.length - 1].content + "\n" + resultString;
    const messages = [
      { role: "system", content: systemPrompt },
      ...data.slice(0, data.length - 1),
      { role: "user", content: lastMessageContent },
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: "llama3-8b-8192",
      stream: false, // Switch to non-streaming for simpler debugging
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
