import csv
import os
import cohere
import json
import time
from dotenv import load_dotenv
from pinecone import Pinecone

# Load environment variables
load_dotenv()

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("rag")

# Initialize Cohere client
co = cohere.Client(os.getenv('COHERE_API_KEY'))

# Path to your CSV file
csv_file_path = 'dataset.csv'  # Update with the actual path

# Helper function to convert to int or return 'N/A'
def safe_int(value):
    try:
        return int(value)
    except (ValueError, TypeError):
        return 'N/A'

# Helper function to convert to float or return 'N/A'
def safe_float(value):
    try:
        return float(value)
    except (ValueError, TypeError):
        return 'N/A'

# Helper function to split and clean tags
def clean_tags(tag_string):
    if not tag_string:
        return []
    return [tag.strip() for tag in tag_string.split(',')]

# Read and process the CSV file
with open(csv_file_path, mode='r', encoding='utf-8') as file:
    reader = csv.DictReader(file)
    
    for row in reader:
        professor_name = row['professor_name']
        school_name = row['school_name']
        department_name = row['department_name']
        overall_quality = safe_float(row['star_rating'])
        number_of_ratings = safe_int(row['num_student'])
        take_again = safe_float(row['take_again'].replace('%', '')) if row['take_again'] else 'N/A'
        difficulty = safe_float(row['diff_index'])
        top_tags = clean_tags(row['tag_professor'])

        # Embed and store professor's general information
        professor_info = f"{professor_name} teaches in the {department_name} department at {school_name}."
        
        # Check the rate limit
        while True:
            try:
                response = co.embed(
                    texts=[professor_info],
                    model="embed-english-v3.0",
                    input_type="search_document"
                )
                break
            except cohere.errors.too_many_requests_error.TooManyRequestsError:
                print("Rate limit reached. Waiting for 60 seconds before retrying...")
                time.sleep(60)

        professor_embedding = response.embeddings[0]

        print(f"Storing professor info: {professor_name}, {department_name}, {school_name}")

        index.upsert(
            vectors=[{
                "values": professor_embedding,
                "id": f"{professor_name}_info".replace(" ", "_"),
                "metadata": {
                    "type": "professor_info",
                    "professor_name": professor_name,
                    "department": department_name,
                    "school": school_name,
                    "overall_quality": overall_quality,
                    "number_of_ratings": number_of_ratings,
                    "would_take_again_percentage": take_again,
                    "level_of_difficulty": difficulty,
                    "top_tags": top_tags
                }
            }],
            namespace="ns1",
        )

        # Extract and store review information if available
        review_comment = row['comments']
        if review_comment:
            review_data = {
                'quality': safe_float(row['student_star']),
                'difficulty': safe_float(row['student_difficult']),
                'subject': row['local_name'],
                'date': row['post_date'],
                'for_credit': row['for_credits'] or 'N/A',
                'attendance': row['attence'] or 'N/A',
                'would_take_again': row['would_take_agains'] or 'N/A',
                'grade_received': row['grades'] or 'N/A',
                'textbook_used': row['IsCourseOnline'] or 'N/A',
                'review': review_comment,
                'tags': clean_tags(row['tag_professor'])  # Adjust to handle tags correctly
            }

            # Check the rate limit
            while True:
                try:
                    response = co.embed(
                        texts=[review_comment],
                        model="embed-english-v3.0",
                        input_type="search_document"
                    )
                    break
                except cohere.errors.too_many_requests_error.TooManyRequestsError:
                    print("Rate limit reached. Waiting for 60 seconds before retrying...")
                    time.sleep(60)

            review_embedding = response.embeddings[0]

            index.upsert(
                vectors=[{
                    "values": review_embedding,
                    "id": f"{professor_name}_{review_data['subject']}_{review_data['date']}".replace(" ", "_"),
                    "metadata": {
                        "type": "review",
                        "professor_name": professor_name,
                        "subject": review_data["subject"],
                        "date": review_data["date"],
                        "quality": review_data["quality"],
                        "difficulty": review_data["difficulty"],
                        "for_credit": review_data["for_credit"],
                        "attendance": review_data["attendance"],
                        "would_take_again": review_data["would_take_again"],
                        "grade_received": review_data["grade_received"],
                        "textbook_used": review_data["textbook_used"],
                        "review": review_data["review"],
                        "tags": review_data["tags"]
                    }
                }],
                namespace="ns1",
            )

        # Print JSON structure for verification (optional)
        professor_data = {
            "professors": [
                {
                    "name": professor_name,
                    "department": department_name,
                    "school": school_name,
                    "overall_quality": overall_quality,
                    "number_of_ratings": number_of_ratings,
                    "would_take_again_percentage": take_again,
                    "level_of_difficulty": difficulty,
                    "top_tags": top_tags,
                    "reviews": [review_data] if review_comment else []
                }
            ]
        }
        print(json.dumps(professor_data, indent=4))
