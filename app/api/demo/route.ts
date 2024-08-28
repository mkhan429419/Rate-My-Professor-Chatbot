import type { NextApiRequest, NextApiResponse } from 'next';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY as string });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Log incoming request method
  console.log(`Received a ${req.method} request`);

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']); // Specify allowed methods
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    return;
  }

  try {
    const { query } = req.body; // Extracting the query from the request body
    console.log("Request body:", req.body); // Log the request body for debugging
    if (!query) {
      res.status(400).json({ error: "Query is required" });
      return;
    }

    const chatCompletion = await getGroqChatCompletion(query);
    res.status(200).json({ message: chatCompletion.choices[0]?.message?.content || "No response" });
  } catch (error) {
    console.error("Error fetching Groq chat completion:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getGroqChatCompletion(query: string) {
  return groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: query, // Use the query passed from the frontend
      },
    ],
    model: "llama3-8b-8192",
  });
}
