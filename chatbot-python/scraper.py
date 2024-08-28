from flask import Flask, request, jsonify
import requests
from bs4 import BeautifulSoup
import json
from dotenv import load_dotenv
import os
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

# Load environment variables
load_dotenv()

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("rag4")

# Initialize SentenceTransformer model
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

# Initialize Flask app
app = Flask(__name__)

@app.route('/scrape', methods=['POST'])
def scrape_professor():
    # Get the URL from the request
    data = request.json
    url = data.get('url')

    if not url:
        return jsonify({'error': 'No URL provided'}), 400

    # Make a GET request to fetch the raw HTML content
    response = requests.get(url)
    html_content = response.text

    # Parse the HTML content with BeautifulSoup
    soup = BeautifulSoup(html_content, 'html.parser')

    # Helper functions (same as before)
    def get_text_or_na(soup_element):
        return soup_element.get_text(strip=True) if soup_element else 'N/A'

    def safe_int(value):
        try:
            return int(value)
        except (ValueError, TypeError):
            return 'N/A'

    def safe_float(value):
        try:
            return float(value)
        except (ValueError, TypeError):
            return 'N/A'

    # Extract the professor's name
    professor_name = get_text_or_na(soup.find('div', class_='NameTitle__Name-dowf0z-0'))

    # Extract the department
    department = get_text_or_na(soup.find('div', class_='NameTitle__Title-dowf0z-1').find('a'))

    # Extract the school name
    school_name = get_text_or_na(soup.find('div', class_='NameTitle__Title-dowf0z-1').find_all('a')[1])

    # Extract the overall rating
    overall_rating = safe_float(get_text_or_na(soup.find('div', class_='RatingValue__Numerator-qw8sqy-2')))

    # Extract the number of ratings
    num_ratings = safe_int(get_text_or_na(soup.find('div', class_='RatingValue__NumRatings-qw8sqy-0').find('a')).replace("ratings", "").strip())

    # Extract the percentage of students who would take again
    take_again_element = soup.find('div', string="Would take again").find_previous_sibling('div')
    take_again = safe_int(get_text_or_na(take_again_element).replace('%', ''))

    # Extract the level of difficulty
    difficulty_element = soup.find('div', string="Level of Difficulty").find_previous_sibling('div')
    difficulty = safe_float(get_text_or_na(difficulty_element))

    # Extract the top tags and ensure uniqueness
    tags_container = soup.find('div', class_='TeacherTags__TagsContainer-sc-16vmh1y-0 dbxJaW')
    top_tags = [get_text_or_na(tag) for tag in tags_container.find_all('span', class_='Tag-bs9vf4-0 hHOVKF')] if tags_container else ['N/A']

    # Extract the reviews
    reviews = []
    review_list = soup.find_all('div', class_='Rating__StyledRating-sc-1rhvpxz-1')

    for review in review_list:
        comment = get_text_or_na(review.find('div', class_='Comments__StyledComments-dzzyvm-0'))
        reviews.append(comment)

    # Combine all relevant information about the professor into a single string
    combined_info = f"{professor_name} teaches in the {department} department at {school_name}. "
    combined_info += f"Overall quality: {overall_rating}, Number of ratings: {num_ratings}, "
    combined_info += f"Would take again percentage: {take_again}%, Level of difficulty: {difficulty}. "
    combined_info += f"Top tags: {', '.join(top_tags)}. Reviews: {' | '.join(reviews)}"

    # Embed the combined information
    professor_embedding = model.encode(combined_info)

    # Store the combined information as a single vector in Pinecone
    index.upsert(
        vectors=[{
            "values": professor_embedding.tolist(),
            "id": f"{professor_name}_info".replace(" ", "_"),
            "metadata": {
                "type": "professor_info",
                "professor_name": professor_name,
                "department": department,
                "school": school_name,
                "overall_quality": overall_rating,
                "number_of_ratings": num_ratings,
                "would_take_again_percentage": take_again,
                "level_of_difficulty": difficulty,
                "top_tags": top_tags,
                "reviews": reviews
            }
        }],
        namespace="ns1",
    )

    # Return the JSON structure
    professor_data = {
        "professors": [
            {
                "name": professor_name,
                "department": department,
                "school": school_name,
                "overall_quality": overall_rating,
                "number_of_ratings": num_ratings,
                "would_take_again_percentage": take_again,
                "level_of_difficulty": difficulty,
                "top_tags": top_tags,
                "reviews": reviews
            }
        ]
    }
    return jsonify(professor_data)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
