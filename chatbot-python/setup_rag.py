from dotenv import load_dotenv
load_dotenv()
from pinecone import Pinecone, ServerlessSpec
import os
import json
import cohere

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Create a Pinecone index
pc.create_index(
    name="rag",
    dimension=1024,  # Updated to match the embedding dimension
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
)

# Load the review data
data = json.load(open("reviews.json"))

processed_data = []

# Initialize Cohere client
co = cohere.Client(os.getenv('COHERE_API_KEY'))

# Iterate through each professor and their reviews
for professor in data["professors"]:
    for review in professor["reviews"]:
        # Create an embedding for each review
        response = co.embed(
            texts=[review['review']],
            model="embed-english-v3.0",  # Correct model for embedding
            input_type="search_document"  # Specify input type appropriate for search use-cases
        )
        embedding = response.embeddings[0]
        
        # Prepare the data to be upserted into Pinecone
        processed_data.append(
            {
                "values": embedding,
                "id": f"{professor['name']}_{review['subject']}_{review['date']}",  # Unique ID for each review
                "metadata": {
                    "professor_name": professor["name"],
                    "department": professor["department"],
                    "school": professor["school"],
                    "overall_quality": professor["overall_quality"],
                    "number_of_ratings": professor["number_of_ratings"],
                    "would_take_again_percentage": professor["would_take_again_percentage"],
                    "level_of_difficulty": professor["level_of_difficulty"],
                    "review_quality": review["quality"],
                    "review_difficulty": review["difficulty"],
                    "subject": review["subject"],
                    "date": review["date"],
                    "for_credit": review["for_credit"],
                    "would_take_again": review["would_take_again"],
                    "grade_received": review["grade_received"],
                    "textbook_used": review["textbook_used"],
                    "review": review["review"],
                    "tags": review["tags"]
                }
            }
        )

# Insert the embeddings into the Pinecone index
index = pc.Index("rag")
upsert_response = index.upsert(
    vectors=processed_data,
    namespace="ns1",
)
print(f"Upserted count: {upsert_response['upserted_count']}")

# Print index statistics
print(index.describe_index_stats())
