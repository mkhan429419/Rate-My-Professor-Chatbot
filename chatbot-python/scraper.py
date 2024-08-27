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
index = pc.Index("rag3")

# Initialize SentenceTransformer model
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

# Define the URL of the page you want to scrape
url = "https://www.ratemyprofessors.com/professor/2501995"  # Replace with the actual URL

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

# Embed and store professor's general information
professor_info = f"{professor_name} teaches in the {department} department at {school_name}."
professor_embedding = model.encode([professor_info])[0]

print(f"Storing professor info: {professor_name}, {department}, {school_name}")

index.upsert(
    vectors=[{
        "values": professor_embedding.tolist(),  # Convert to list before upserting
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
            "top_tags": top_tags
        }
    }],
    namespace="ns1",
)

# Embed and store each review
for review in reviews:
    review_embedding = model.encode([review['review']])[0]

    index.upsert(
        vectors=[{
            "values": review_embedding.tolist(),  # Convert to list before upserting
            "id": f"{professor_name}_{review['subject']}_{review['date']}".replace(" ", "_"),
            "metadata": {
                "type": "review",
                "professor_name": professor_name,
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
        }],
        namespace="ns1",
    )

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
