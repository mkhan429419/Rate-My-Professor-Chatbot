from dotenv import load_dotenv
load_dotenv()
from pinecone import Pinecone, ServerlessSpec
import os
import json
from sentence_transformers import SentenceTransformer

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Create a Pinecone index
pc.create_index(
    name="rag3",
    dimension=384,  # Updated to match the embedding dimension of the model used
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
)

# Load the review data
with open("reviews.json") as f:
    data = json.load(f)

processed_data = []

# Initialize Sentence Transformer model
model = SentenceTransformer('all-MiniLM-L6-v2')  # This model has a 384-dimensional output

# Iterate through each professor and their reviews
for professor in data["professors"]:
    # Embed professor's general information
    professor_info = f"{professor['name']} teaches in the {professor['department']} department at {professor['school']}."
    professor_embedding = model.encode(professor_info)

    # Store professor's general information as a vector
    processed_data.append({
        "values": professor_embedding.tolist(),
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
        review_embedding = model.encode(review['review'])

        # Store each review as a separate vector
        processed_data.append({
            "values": review_embedding.tolist(),
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
index = pc.Index("rag3")
upsert_response = index.upsert(
    vectors=processed_data,
    namespace="ns1",
)
print(f"Upserted count: {upsert_response['upserted_count']}")

# Print index statistics
print(index.describe_index_stats())
