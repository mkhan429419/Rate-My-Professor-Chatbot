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
with open("reviews.json") as f:
    data = json.load(f)

processed_data = []

# Initialize Cohere client
co = cohere.Client(os.getenv('COHERE_API_KEY'))

# Iterate through each professor and their reviews
for professor in data["professors"]:
    # Embed professor's general information
    professor_info = f"{professor['name']} teaches in the {professor['department']} department at {professor['school']}."
    response = co.embed(
        texts=[professor_info],
        model="embed-english-v3.0",
        input_type="search_document"
    )
    professor_embedding = response.embeddings[0]

    # Store professor's general information as a vector
    processed_data.append({
        "values": professor_embedding,
        "id": f"{professor['name']}_info".replace(" ", "_"),
        "metadata": {
            "type": "professor_info",
            "professor_name": professor["name"],
            "department": professor["department"],
            "school": professor["school"],
            "overall_quality": professor["overall_quality"],
            "number_of_ratings": professor["number_of_ratings"],
            "would_take_again_percentage": professor["would_take_again_percentage"],
            "level_of_difficulty": professor["level_of_difficulty"],
            "top_tags": professor["top_tags"]
        }
    })

    # Iterate through the professor's reviews
    for review in professor["reviews"]:
        # Create an embedding for each review
        response = co.embed(
            texts=[review['review']],
            model="embed-english-v3.0",
            input_type="search_document"
        )
        review_embedding = response.embeddings[0]

        # Store each review as a separate vector
        processed_data.append({
            "values": review_embedding,
            "id": f"{professor['name']}_{review['subject']}_{review['date']}".replace(" ", "_"),
            "metadata": {
                "type": "review",
                "professor_name": professor["name"],
                "subject": review["subject"],
                "date": review["date"],
                "quality": review["quality"],
                "difficulty": review["difficulty"],
                "for_credit": review["for_credit"],
                "attendance": review.get("attendance", "N/A"),
                "would_take_again": review["would_take_again"],
                "grade_received": review["grade_received"],
                "textbook_used": review["textbook_used"],
                "review": review["review"],
                "tags": review["tags"]
            }
        })

# Insert the embeddings into the Pinecone index
index = pc.Index("rag")
upsert_response = index.upsert(
    vectors=processed_data,
    namespace="ns1",
)
print(f"Upserted count: {upsert_response['upserted_count']}")

# Print index statistics
print(index.describe_index_stats())
