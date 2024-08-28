import fetch from "node-fetch";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone"; // Import Pinecone class
import FormData from "form-data";

// Load environment variables
dotenv.config();

// Initialize Pinecone
const client = new Pinecone({
  apiKey: process.env.NEXT_PUBLIC_PINECONE_API_KEY,
});

const index = client.index("rag4"); // Access the specific index

// Helper functions
const getTextOrNA = (element) => (element ? element.text().trim() : "N/A");
const safeInt = (value) => (isNaN(parseInt(value)) ? "N/A" : parseInt(value));
const safeFloat = (value) =>
  isNaN(parseFloat(value)) ? "N/A" : parseFloat(value);

// Get URL from the command line arguments
const url = process.argv[2];
if (!url) {
  console.error("Error: No URL provided");
  process.exit(1);
}

// Function to fetch HTML and scrape data
const scrapeData = async (url) => {
  const response = await fetch(url);
  const html = await response.text();
  const $ = cheerio.load(html);

  // Scrape the data
  const professorName = getTextOrNA($("div.NameTitle__Name-dowf0z-0"));
  const department = getTextOrNA($("div.NameTitle__Title-dowf0z-1 a").first());
  const schoolName = getTextOrNA($("div.NameTitle__Title-dowf0z-1 a").eq(1));
  const overallRating = safeFloat(
    getTextOrNA($("div.RatingValue__Numerator-qw8sqy-2"))
  );
  const numRatings = safeInt(
    getTextOrNA($("div.RatingValue__NumRatings-qw8sqy-0 a"))
      .replace("ratings", "")
      .trim()
  );
  const takeAgain = safeInt(
    getTextOrNA($('div:contains("Would take again")').prev()).replace("%", "")
  );
  const difficulty = safeFloat(
    getTextOrNA($('div:contains("Level of Difficulty")').prev())
  );

  const tags = [];
  $("div.TeacherTags__TagsContainer-sc-16vmh1y-0 span.Tag-bs9vf4-0").each(
    (_, el) => {
      tags.push(getTextOrNA($(el)));
    }
  );

  const reviews = [];
  $("div.Rating__StyledRating-sc-1rhvpxz-1").each((_, el) => {
    reviews.push(
      getTextOrNA($(el).find("div.Comments__StyledComments-dzzyvm-0"))
    );
  });

  return {
    professorName,
    department,
    schoolName,
    overallRating,
    numRatings,
    takeAgain,
    difficulty,
    topTags: tags.length ? tags : ["N/A"],
    reviews,
  };
};

// Function to get embedding from Hugging Face API
const getEmbedding = async (text) => {
  const formData = new FormData();
  formData.append("inputs", text);

  const response = await fetch(
    "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.HUGGING_FACE_API_KEY}` },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch embedding: ${response.statusText}`);
  }

  const data = await response.json();
  return data[0];
};

// Main function
const main = async () => {
  try {
    const professorData = await scrapeData(url);

    // Combine data into a single string
    const combinedInfo = `${professorData.professorName} teaches in the ${
      professorData.department
    } department at ${professorData.schoolName}. 
      Overall quality: ${professorData.overallRating}, Number of ratings: ${
      professorData.numRatings
    }, 
      Would take again percentage: ${
        professorData.takeAgain
      }%, Level of difficulty: ${professorData.difficulty}. 
      Top tags: ${professorData.topTags.join(
        ", "
      )}. Reviews: ${professorData.reviews.join(" | ")}`;

    // Get embedding from Hugging Face
    const professorEmbedding = await getEmbedding(combinedInfo);

    // Store the combined information as a single vector in Pinecone
    await index.upsert({
      vectors: [
        {
          id: `${professorData.professorName}_info`.replace(/\s+/g, "_"),
          values: professorEmbedding,
          metadata: {
            type: "professor_info",
            professor_name: professorData.professorName,
            department: professorData.department,
            school: professorData.schoolName,
            overall_quality: professorData.overallRating,
            number_of_ratings: professorData.numRatings,
            would_take_again_percentage: professorData.takeAgain,
            level_of_difficulty: professorData.difficulty,
            top_tags: professorData.topTags,
            reviews: professorData.reviews,
          },
        },
      ],
      namespace: "ns1",
    });

    // Print the JSON structure (for verification)
    console.log(JSON.stringify({ professors: [professorData] }, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }
};

main();
