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

# Create embeddings for each review using Cohere API
for review in data["reviews"]:
    response = co.embed(
        texts=[review['review']],
        model="embed-english-v3.0",  # Correct model for embedding
        input_type="search_document"  # Specify input type appropriate for search use-cases
    )
    embedding = response.embeddings[0]
    processed_data.append(
        {
            "values": embedding,
            "id": review["professor"],
            "metadata":{
                "review": review["review"],
                "subject": review["subject"],
                "stars": review["stars"],
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
