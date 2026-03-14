from datetime import datetime, timedelta

def initialize_scanner(user_id, jurisdiction="EU"):
    """
    Simulates an explicit-consent gateway.
    Jurisdictions: 'EU' (GDPR), 'US' (CCPA), 'Global'
    """
    consent_record = {
        "user_id": user_id,
        "consent_given": True,
        "purpose": "Job matching & professional footprint summarization",
        "timestamp": datetime.now().isoformat(),
        "jurisdiction": jurisdiction,
        "data_expiry": (datetime.now() + timedelta(days=30)).isoformat() if jurisdiction == "EU" else "None"
    }
    
    print(f"✅ Consent Recorded for {user_id} under {jurisdiction} laws.")
    return consent_record

session_context = initialize_scanner("User_01", jurisdiction="EU")

import requests
import base64
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def get_github_signals(github_username, timeout=10):
    """
    Fetches Bio, Profile README, and Repo data with retry logic & timeouts.
    """
    signals = []

    # Build a resilient session
    gh_session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
    gh_session.mount("https://", HTTPAdapter(max_retries=retries))
    headers = {"Accept": "application/vnd.github.v3+json"}

    # 1. Fetch Basic Profile (Bio & Company)
    try:
        user_url = f"https://api.github.com/users/{github_username}"
        user_resp = gh_session.get(user_url, headers=headers, timeout=timeout)
        if user_resp.status_code == 200:
            user_data = user_resp.json()
            signals.append(user_data.get('bio', '') or '')
            signals.append(user_data.get('company', '') or '')
            print(f"  ✅ GitHub profile fetched for {github_username}")
        else:
            print(f"  GitHub profile returned {user_resp.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"  GitHub profile request failed: {e}")

    # 2. Fetch Profile README (contains 'Tech Stack' icons)
    try:
        readme_url = f"https://api.github.com/repos/{github_username}/{github_username}/contents/README.md"
        readme_resp = gh_session.get(readme_url, headers=headers, timeout=timeout)
        if readme_resp.status_code == 200:
            readme_data = readme_resp.json()
            raw_content = base64.b64decode(readme_data['content']).decode('utf-8')
            signals.append(raw_content)
            print(f"  ✅ Profile README fetched ({len(raw_content)} chars)")
        else:
            print(f"  ⚠️ No profile README found (status {readme_resp.status_code})")
    except requests.exceptions.RequestException as e:
        print(f" README request failed: {e}")

    # 3. Fetch Repositories
    try:
        repo_url = f"https://api.github.com/users/{github_username}/repos?per_page=50&sort=updated"
        repo_resp = gh_session.get(repo_url, headers=headers, timeout=timeout)
        if repo_resp.status_code == 200:
            repos = repo_resp.json()
            for r in repos:
                desc = r.get('description', '') or ''
                lang = r.get('language', '') or ''
                topics = ", ".join(r.get('topics', []))
                parts = [p for p in [desc, lang, topics] if p]
                if parts:
                    signals.append(f"{' | '.join(parts)}")
            print(f"  ✅ Fetched {len(repos)} repositories")
        else:
            print(f"  ⚠️ Repos returned {repo_resp.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"  Repos request failed: {e}")

    return " ".join(filter(None, signals))

print("✅ get_github_signals() defined.")

import re
from collections import Counter

KNOWN_TECH_SKILLS = {
    "python", "java", "javascript", "typescript", "c++", "c#", "rust", "go", "ruby", "php",
    "swift", "kotlin", "scala", "r", "matlab", "sql", "html", "css", "sass", "less",
    "react", "angular", "vue", "svelte", "nextjs", "nuxt", "django", "flask", "fastapi",
    "spring", "springboot", "express", "nodejs", "docker", "kubernetes", "terraform",
    "aws", "azure", "gcp", "firebase", "heroku", "vercel", "netlify",
    "pytorch", "tensorflow", "keras", "scikit-learn", "pandas", "numpy", "matplotlib",
    "opencv", "spacy", "nltk", "huggingface", "transformers", "langchain",
    "git", "github", "gitlab", "jenkins", "ci/cd", "linux", "bash", "powershell",
    "mongodb", "postgresql", "mysql", "redis", "elasticsearch", "kafka", "rabbitmq",
    "graphql", "rest", "api", "microservices", "machine-learning", "deep-learning",
    "nlp", "computer-vision", "data-science", "ai", "ml", "llm", "rag",
    "figma", "photoshop", "illustrator", "blender", "unity", "unreal",
    "jupyter", "notebook", "vscode", "intellij", "streamlit", "gradio",
}

def extract_skills_from_text(text):
    text_lower = text.lower()
    tokens = set(re.split(r'[\s,|/\(\)\[\]]+', text_lower))
    found = sorted(KNOWN_TECH_SKILLS & tokens)
    return found

def generate_footprint_summary(clean_text, raw_text=None):
    
    footprint_vector = embed_model.encode([clean_text])

    garbage_words = {"tags", "profile", "view", "link", "image",
                     "http", "https", "www", "com", "org", "img", "src", "alt", "svg",
                     "none", "name", "the", "and", "for"}

    words = [w for w in clean_text.lower().split()
             if len(w) > 2 and w not in garbage_words and not w.startswith("http")]

    if not words:
        return footprint_vector, "No significant signals found."

    top_keywords = [word for word, _ in Counter(words).most_common(15)]

    source = raw_text if raw_text else clean_text
    lines = source.split("\n")

    summary_parts = []
    summary_parts.append("═" * 50)
    summary_parts.append("       🧬 FULL PROFESSIONAL FOOTPRINT REPORT")
    summary_parts.append("           (Source: GitHub)")
    summary_parts.append("═" * 50)

    detected = extract_skills_from_text(source)
    if detected:
        summary_parts.append(f"\n🛠️ Skills ({len(detected)} detected):")
        for i in range(0, len(detected), 5):
            chunk = detected[i:i+5]
            summary_parts.append(f"  {' • '.join(chunk)}")

    display_lines = [l.strip() for l in lines if l.strip()]
    if display_lines:
        summary_parts.append(f"\n🔧 GitHub Signals:")
        for sig in display_lines[:20]:
            display_sig = sig[:120] + "..." if len(sig) > 120 else sig
            summary_parts.append(f"  • {display_sig}")

    # Top keywords
    summary_parts.append(f"\n🏷️ Top Keywords: {', '.join(top_keywords)}")
    summary_parts.append("═" * 50)

    summary = "\n".join(summary_parts)
    return footprint_vector, summary

print("✅ generate_footprint_summary() defined.")

import spacy
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

nlp = spacy.load("en_core_web_sm")
session = requests.Session()
retries = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
session.mount("https://", HTTPAdapter(max_retries=retries))

def minimize_data(raw_text, jurisdiction="EU"):
    """
    Scrubs PII while preserving technical skills.
    """
    doc = nlp(raw_text)
    clean_tokens = []
    
    pii_entities = ["PERSON", "DATE", "PHONE", "EMAIL"]
    
    for token in doc:
        if token.ent_type_ in pii_entities:
            if jurisdiction == "EU":
                continue # GDPR compliance: remove entirely
            else:
                clean_tokens.append(f"<{token.ent_type_}>")
        elif not token.is_stop and not token.is_punct:
            clean_tokens.append(token.text)
            
    return " ".join(clean_tokens)


GITHUB_USER = "Souhail-001"

print("🛰️ Starting Resilient Signal Collection...")

raw_gh = ""

try:
    print(f"📡 Fetching GitHub for {GITHUB_USER}...")
    raw_gh = get_github_signals(GITHUB_USER)
    if not raw_gh:
        print(" GitHub returned no data (check username).")
except Exception as e:
    print(f" GitHub Connection Failed: {e}. Skipping...")


if raw_gh:
    print(f"📝 Total Raw Signals Captured: {len(raw_gh)} characters.")
    clean_footprint = minimize_data(raw_gh, jurisdiction=session_context['jurisdiction'])
    
    footprint_vec, summary_text = generate_footprint_summary(clean_footprint)
    print("\n" + "="*40)
    print("🛡️ FOOTPRINT SCAN COMPLETE")
    print(f"📝 {summary_text}")
    print("="*40)
else:
    print(" CRITICAL FAILURE: No signals captured from any source. Check internet connection.")
