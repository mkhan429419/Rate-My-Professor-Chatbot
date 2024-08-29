import { NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";
import { HfInference } from "@huggingface/inference";

// Initialize Hugging Face Inference API client with the correct API key
const hf = new HfInference(process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY);

export async function POST(request: Request) {
  const { url } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    // Fetch the HTML from the URL
    const { data: html } = await axios.get(url);
    
    // Load the HTML into Cheerio
    const $ = cheerio.load(html);

    // Extract data using Cheerio
    const getTextOrNA = (selector: string): string => {
      return $(selector).text().trim() || "N/A";
    };

    const professorName = getTextOrNA("div.NameTitle__Name-dowf0z-0");
    const titleElements = $("div.NameTitle__Title-dowf0z-1 a");
    const department = titleElements.eq(0).text().trim() || "N/A";
    const schoolName = titleElements.eq(1).text().trim() || "N/A";
    const overallRating = getTextOrNA("div.RatingValue__Numerator-qw8sqy-2");
    const numRatings = getTextOrNA("div.RatingValue__NumRatings-qw8sqy-0 a")
      .replace("ratings", "")
      .trim() || "N/A";
    const takeAgain = getTextOrNA(
      "div.FeedbackItem__StyledFeedbackItem-uof32n-0.dTFbKx:nth-child(1) div.FeedbackItem__FeedbackNumber-uof32n-1.kkESWs"
    ).replace("%", "") || "N/A";
    const difficulty = getTextOrNA(
      "div.FeedbackItem__StyledFeedbackItem-uof32n-0.dTFbKx:nth-child(2) div.FeedbackItem__FeedbackNumber-uof32n-1.kkESWs"
    ) || "N/A";
    const tags = $("div.TeacherTags__TagsContainer-sc-16vmh1y-0 span.Tag-bs9vf4-0")
      .map((_, tag) => $(tag).text().trim() || "N/A")
      .get();
    const reviews = $("div.Rating__StyledRating-sc-1rhvpxz-1 div.Comments__StyledComments-dzzyvm-0")
      .map((_, review) => $(review).text().trim() || "N/A")
      .get();

    const professorData = {
      professorName: professorName.replace(/\s+/g, "").toLowerCase(),
      department: department.replace(/\s+/g, "").toLowerCase(),
      schoolName: schoolName.toLowerCase(),
      overallRating,
      numRatings: numRatings !== "N/A" ? parseInt(numRatings) : "N/A",
      takeAgain: takeAgain !== "N/A" ? parseInt(takeAgain) : "N/A",
      difficulty: difficulty !== "N/A" ? parseFloat(difficulty) : "N/A",
      tags: tags.length > 0 ? tags.map(tag => tag.toLowerCase()) : ["N/A"],
      reviews: reviews.length > 0 ? reviews : ["N/A"],
    };

    // Combine all relevant information about the professor into a single string
    const combinedInfo = `${professorData.professorName} teaches in the ${
      professorData.department
    } department at ${professorData.schoolName}. 
    Overall quality: ${professorData.overallRating}, Number of ratings: ${
      professorData.numRatings
    }, 
    Would take again percentage: ${
      professorData.takeAgain
    }%, Level of difficulty: ${professorData.difficulty}. 
    Top tags: ${professorData.tags.join(
      ", "
    )}. Reviews: ${professorData.reviews.join(" | ")}`;

    // Generate embeddings using Hugging Face Inference API
    const embeddingsResponse = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: combinedInfo,
    });

    const embeddings = Array.isArray(embeddingsResponse[0])
      ? (embeddingsResponse[0] as number[][]).flat()
      : (embeddingsResponse as number[]);

    if (!embeddings || embeddings.length === 0) {
      throw new Error("Invalid embeddings received from Hugging Face.");
    }

    // Initialize Pinecone client
    const pinecone = new Pinecone({
      apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY!,
    });
    const index = pinecone.index("rag4").namespace("ns1");

    // Store the combined information as a single vector in Pinecone
    const record: PineconeRecord = {
      id: `${professorData.professorName.replace(/\s+/g, "_")}_info`,
      values: embeddings,
      metadata: {
        type: "professor_info",
        professor_name: professorData.professorName,
        department: professorData.department,
        school: professorData.schoolName,
        overall_quality: professorData.overallRating,
        number_of_ratings: professorData.numRatings,
        would_take_again_percentage: professorData.takeAgain,
        level_of_difficulty: professorData.difficulty,
        top_tags: professorData.tags,
        reviews: professorData.reviews,
      },
    };

    console.log("Upserting record to Pinecone:", record);

    await index.upsert([record]);

    return NextResponse.json({ success: true, professorData });
  } catch (error) {
    console.error("Scraping failed:", error);
    return NextResponse.json(
      { error: "Failed to scrape the URL" },
      { status: 500 }
    );
  }
}
