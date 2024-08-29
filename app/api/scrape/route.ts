import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { CohereClient } from "cohere-ai";
import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";

export async function POST(request: Request) {
  const { url } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // Navigate to the provided URL
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Extract data using Puppeteer
    const professorData = await page.evaluate(() => {
      const getTextOrNA = (element: HTMLElement | null): string => {
        return element?.textContent?.trim() || "N/A";
      };

      const professorName = getTextOrNA(
        document.querySelector("div.NameTitle__Name-dowf0z-0")
      );
      const titleElements = document.querySelectorAll(
        "div.NameTitle__Title-dowf0z-1 a"
      );
      const department = getTextOrNA(titleElements[0] as HTMLElement);
      const schoolName = getTextOrNA(titleElements[1] as HTMLElement);
      const overallRating = getTextOrNA(
        document.querySelector("div.RatingValue__Numerator-qw8sqy-2")
      );
      const numRatings = getTextOrNA(
        document.querySelector("div.RatingValue__NumRatings-qw8sqy-0 a")
      )
        .replace("ratings", "")
        .trim();
      const takeAgain = getTextOrNA(
        document.querySelector(
          "div.FeedbackItem__StyledFeedbackItem-uof32n-0.dTFbKx:nth-child(1) div.FeedbackItem__FeedbackNumber-uof32n-1.kkESWs"
        )
      ).replace("%", "");
      const difficulty = getTextOrNA(
        document.querySelector(
          "div.FeedbackItem__StyledFeedbackItem-uof32n-0.dTFbKx:nth-child(2) div.FeedbackItem__FeedbackNumber-uof32n-1.kkESWs"
        )
      );
      const tags = Array.from(
        document.querySelectorAll(
          "div.TeacherTags__TagsContainer-sc-16vmh1y-0 span.Tag-bs9vf4-0"
        )
      ).map((tag) => tag.textContent?.trim() || "N/A");
      const reviews = Array.from(
        document.querySelectorAll(
          "div.Rating__StyledRating-sc-1rhvpxz-1 div.Comments__StyledComments-dzzyvm-0"
        )
      ).map((review) => review.textContent?.trim() || "N/A");

      return {
        professorName: professorName.replace(/\s+/g, "").toLowerCase(),
        department: department.replace(/\s+/g, "").toLowerCase(),
        schoolName: schoolName.toLowerCase(),
        overallRating,
        numRatings: parseInt(numRatings) || "N/A",
        takeAgain: takeAgain !== "N/A" ? parseInt(takeAgain) : "N/A",
        difficulty: difficulty !== "N/A" ? parseFloat(difficulty) : "N/A",
        tags: tags.length > 0 ? tags.map(tag => tag.toLowerCase()) : ["N/A"],
        reviews: reviews.length > 0 ? reviews : ["N/A"],
      };
    });

    // Close Puppeteer
    await browser.close();

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

    // Initialize Cohere client with the API key
    const cohereClient = new CohereClient({
      token: process.env.NEXT_PUBLIC_COHERE_API_KEY!,
    });

    // Get embeddings from Cohere
    const response = await cohereClient.embed({
      texts: [combinedInfo],
      model: "embed-english-light-v3.0", // This model generates embeddings with a dimension of 384
      inputType: "search_document", // or "classification", "clustering", depending on your use case
    });

    // Cast the embeddings to an array of numbers
    const embeddings = response.embeddings as number[][];

    const embedding = embeddings[0]; // Access the first embedding

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Failed to get embeddings from Cohere");
    }

    // Initialize Pinecone client
    const pinecone = new Pinecone({
      apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY!,
    });
    const index = pinecone.index("rag4").namespace("ns1");

    // Store the combined information as a single vector in Pinecone
    const record: PineconeRecord = {
      id: `${professorData.professorName}_info`,
      values: embedding,
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
