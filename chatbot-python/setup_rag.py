from dotenv import load_dotenv
import os
import json
from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer

# Load environment variables
load_dotenv()

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Create a Pinecone index for RAG4
pc.create_index(
    name="rag4",
    dimension=384,  # Match the embedding dimension of the model used
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
)

# Load the review data from reviews.json
with open("reviews.json") as f:
    data = json.load(f)

processed_data = []

# Initialize Sentence Transformer model
model = SentenceTransformer('all-MiniLM-L6-v2')  # This model outputs 384-dimensional embeddings

# Iterate through each professor in the data
for professor in data["professors"]:
    # Combine all relevant information about the professor into a single string
    combined_info = f"{professor['name']} teaches in the {professor['department']} department at {professor['school']}. "
    combined_info += f"Overall quality: {professor['overall_quality']}, Number of ratings: {professor['number_of_ratings']}, "
    combined_info += f"Would take again percentage: {professor['would_take_again_percentage']}%, Level of difficulty: {professor['level_of_difficulty']}. "
    combined_info += f"Top tags: {', '.join(professor['top_tags'])}. Reviews: {' | '.join(professor['reviews'])}"

    # Create an embedding for the combined information
    professor_embedding = model.encode(combined_info)

    # Store the combined information as a single vector in Pinecone
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
            "top_tags": professor["top_tags"],
            "reviews": professor["reviews"]
        }
    })

# Insert the embeddings into the Pinecone index
index = pc.Index("rag4")
upsert_response = index.upsert(
    vectors=processed_data,
    namespace="ns1",
)
print(f"Upserted count: {upsert_response['upserted_count']}")

# Print index statistics
print(index.describe_index_stats())
