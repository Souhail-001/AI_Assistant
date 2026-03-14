"""Keyword extraction and embedding-based job ranking."""

import spacy
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

nlp = spacy.load("en_core_web_sm")
embed_model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")


def extract_keywords(resume_text: str, top_n: int = 10) -> list[str]:
    """
    Extract the most meaningful lemmatised keywords from resume text
    using spaCy POS filtering (nouns, proper nouns, adjectives).
    """
    doc = nlp(resume_text.lower())
    tokens = [
        token.lemma_
        for token in doc
        if not token.is_stop
        and not token.is_punct
        and not token.is_space
        and len(token.text) > 2
        and token.pos_ in ("NOUN", "PROPN", "ADJ")
    ]
    # rank by frequency, return unique
    from collections import Counter

    freq = Counter(tokens)
    return [word for word, _ in freq.most_common(top_n)]


def rank_jobs(resume_text: str, jobs: list[dict]) -> list[dict]:
    """
    Rank *jobs* by cosine similarity between their description
    and the resume text using sentence-transformer embeddings.

    Each job dict is returned with an added ``match_score`` key.
    """
    doc = nlp(resume_text.lower())
    clean_resume = " ".join(
        t.lemma_ for t in doc if not t.is_stop and not t.is_punct
    )
    resume_vec = embed_model.encode([clean_resume])

    for job in jobs:
        job_text = f"{job.get('title', '')} {job.get('description', '')}"
        jdoc = nlp(job_text.lower())
        clean_job = " ".join(
            t.lemma_ for t in jdoc if not t.is_stop and not t.is_punct
        )
        job_vec = embed_model.encode([clean_job])
        score = float(cosine_similarity(resume_vec, job_vec)[0][0])
        job["match_score"] = score

    jobs.sort(key=lambda j: j.get("match_score", 0), reverse=True)
    return jobs
