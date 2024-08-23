import requests
from bs4 import BeautifulSoup
import json
from dotenv import load_dotenv
import os
import cohere
from pinecone import Pinecone

# Load environment variables
load_dotenv()

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("rag")

# Initialize Cohere client
co = cohere.Client(os.getenv('COHERE_API_KEY'))

# Define the URL of the page you want to scrape
url = "https://www.ratemyprofessors.com/professor/1729604"  # Replace with the actual URL

# Make a GET request to fetch the raw HTML content
response = requests.get(url)
html_content = response.text

# Parse the HTML content with BeautifulSoup
soup = BeautifulSoup(html_content, 'html.parser')

# Helper function to extract text safely
def get_text_or_na(soup_element):
    return soup_element.get_text(strip=True) if soup_element else 'N/A'

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
take_again = safe_int(get_text_or_na(soup.find('div', class_='FeedbackItem__FeedbackNumber-uof32n-1')).replace('%', ''))

# Extract the level of difficulty
difficulty_elements = soup.find_all('div', class_='FeedbackItem__FeedbackNumber-uof32n-1')
difficulty = 'N/A'
for elem in difficulty_elements:
    previous_sibling = elem.find_previous_sibling('div', class_='FeedbackItem__FeedbackText-uof32n-0')
    if previous_sibling:
        label = previous_sibling.get_text(strip=True)
        if 'Level of Difficulty' in label:
            difficulty = safe_float(get_text_or_na(elem))
            break

# Extract the top tags and ensure uniqueness
top_tags = list(set(get_text_or_na(tag) for tag in soup.find_all('span', class_='Tag-bs9vf4-0'))) if soup.find_all('span', class_='Tag-bs9vf4-0') else ['N/A']

# Extract the reviews
reviews = []
review_list = soup.find_all('div', class_='Rating__StyledRating-sc-1rhvpxz-1')

for review in review_list:
    class_name = get_text_or_na(review.find('div', class_='RatingHeader__StyledClass-sc-1dlkqw1-3'))
    date = get_text_or_na(review.find('div', class_='TimeStamp__StyledTimeStamp-sc-9q2r30-0'))
    quality_rating = safe_float(get_text_or_na(review.find_all('div', class_='CardNumRating__CardNumRatingNumber-sc-17t4b9u-2')[0])) if len(review.find_all('div', class_='CardNumRating__CardNumRatingNumber-sc-17t4b9u-2')) > 0 else 'N/A'
    difficulty_rating = safe_float(get_text_or_na(review.find_all('div', class_='CardNumRating__CardNumRatingNumber-sc-17t4b9u-2')[1])) if len(review.find_all('div', class_='CardNumRating__CardNumRatingNumber-sc-17t4b9u-2')) > 1 else 'N/A'
    comment = get_text_or_na(review.find('div', class_='Comments__StyledComments-dzzyvm-0'))
    review_tags = [get_text_or_na(tag) for tag in review.find_all('span', class_='Tag-bs9vf4-0')] if review.find_all('span', class_='Tag-bs9vf4-0') else ['N/A']

    # Extract the specific meta items with checks for each tag
    meta_items = review.find_all('div', class_='MetaItem__StyledMetaItem-y0ixml-0')
    for_credit = 'N/A'
    attendance = 'N/A'
    would_take_again = 'N/A'
    grade_received = 'N/A'
    textbook_used = 'N/A'

    for meta_item in meta_items:
        label = meta_item.get_text(strip=True)
        value = meta_item.find('span').get_text(strip=True) if meta_item.find('span') else 'N/A'

        if 'For Credit' in label:
            for_credit = value
        elif 'Attendance' in label:
            attendance = value
        elif 'Would Take Again' in label:
            would_take_again = value
        elif 'Grade' in label:
            grade_received = value
        elif 'Textbook' in label:
            textbook_used = value

    reviews.append({
        'quality': quality_rating,
        'difficulty': difficulty_rating,
        'subject': class_name,
        'date': date,
        'for_credit': for_credit,
        'attendance': attendance,
        'would_take_again': would_take_again,
        'grade_received': grade_received,
        'textbook_used': textbook_used,
        'review': comment,
        'tags': review_tags
    })

# Prepare data for Pinecone and Cohere
processed_data = []

for review in reviews:
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
            "id": f"{professor_name}_{review['subject']}_{review['date']}".replace(" ", "_"),  # Unique ID for each review, spaces replaced with underscores
            "metadata": {
                "professor_name": professor_name,
                "department": department,
                "school": school_name,
                "overall_quality": overall_rating,
                "number_of_ratings": num_ratings,
                "would_take_again_percentage": take_again,
                "level_of_difficulty": difficulty,
                "review_quality": review["quality"],
                "review_difficulty": review["difficulty"],
                "subject": review["subject"],
                "date": review["date"],
                "for_credit": review["for_credit"],
                "attendance": review.get("attendance", "N/A"),
                "would_take_again": review["would_take_again"],
                "grade_received": review["grade_received"],
                "textbook_used": review["textbook_used"],
                "review": review["review"],
                "tags": review["tags"]
            }
        }
    )

# Insert the embeddings into the Pinecone index
upsert_response = index.upsert(
    vectors=processed_data,
    namespace="ns1",
)
print(f"Upserted count: {upsert_response['upserted_count']}")

# Print the JSON structure (for verification)
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
print(json.dumps(professor_data, indent=4))
