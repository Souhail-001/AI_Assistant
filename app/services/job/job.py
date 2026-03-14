import requests
import pandas as pd
from pypdf import PdfReader
import spacy
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

nlp = spacy.load("en_core_web_sm")

embed_model = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')

ADZUNA_APP_ID = "cd917cf7"
ADZUNA_APP_KEY = "a21530797f7814dd0000e514f93d98a2"

def get_clean_text(path):
    reader = PdfReader(path)
    raw_text = " ".join([page.extract_text() for page in reader.pages])
    
    doc = nlp(raw_text.lower())
    clean_text = " ".join([token.lemma_ for token in doc if not token.is_stop and not token.is_punct])
    return clean_text

#cv_text = get_clean_text("R1.pdf")
print("CV Text Cleaned and Lemmatized.")

import time

def fetch_europe_jobs(keyword, countries=['gb', 'ch', 'it', 'de', 'fr', 'nl', 'pl', 'ca', 'us'], results_limit=5):
    all_jobs = []
    
    for country_code in countries:
        print(f"Searching in {country_code.upper()}...")
        url = f"https://api.adzuna.com/v1/api/jobs/{country_code}/search/1"
        params = {
            'app_id': ADZUNA_APP_ID,
            'app_key': ADZUNA_APP_KEY,
            'results_per_page': results_limit,
            'what': keyword,
            'content-type': 'application/json'
        }
        try:
            response = requests.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                for result in data.get('results', []):
                    all_jobs.append({
                        "title": result.get('title'),
                        "desc": result.get('description'),
                        "company": result.get('company', {}).get('display_name', 'N/A'),
                        "location": f"{result.get('location', {}).get('display_name')} ({country_code.upper()})",
                        "url": result.get('redirect_url')
                    })
            else:
                print(f"Error {response.status_code} for {country_code}")
                
            time.sleep(1) 
            
        except Exception as e:
            print(f"Failed to fetch from {country_code}: {e}")

    return all_jobs
countries = ['fr', 'de', 'it']
#countries = ['gb', 'ch', 'it', 'de', 'fr', 'nl', 'pl', 'ca', 'us']
real_job_list = fetch_europe_jobs("junior Ai engineer", countries=countries)
print(f"Fetched {len(real_job_list)} total jobs from Europe and America.")

cv_embedding = embed_model.encode([cv_text])

final_matches = []

for job in real_job_list:
    job_full_text = f"{job['title']} {job['desc']}"
    doc = nlp(job_full_text.lower())
    clean_job = " ".join([t.lemma_ for t in doc if not t.is_stop and not t.is_punct])
    
    job_embedding = embed_model.encode([clean_job])
    score = cosine_similarity(cv_embedding, job_embedding)[0][0]
    
    final_matches.append({
        "Job Title": job['title'],
        "Match Score": round(score * 100, 2),
        "Link": job['url']
    })

results_df = pd.DataFrame(final_matches).sort_values(by="Match Score", ascending=False)
results_df.to_csv("my_job_matches.csv", index=False)
print("✅ File saved successfully as 'my_job_matches.csv'")
display(results_df)