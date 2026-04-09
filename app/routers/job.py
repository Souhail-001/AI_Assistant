"""Job Matcher API endpoints."""

from fastapi import APIRouter, HTTPException
from app.models.job import JobMatchRequest, JobMatchResponse, JobMatch
from app.services.job_matcher.embedder import extract_keywords, rank_jobs
from app.services.job_matcher.serpapi_client import search_jobs

router = APIRouter()


@router.post("/match", response_model=JobMatchResponse)
async def match_jobs(request: JobMatchRequest):
    """
    Match a resume against live job listings from Google Jobs via SerpApi.

    Pipeline:
      1. Extract keywords from resume via spaCy
      2. Search Google Jobs for relevant jobs
      3. Rank results by cosine similarity (spaCy embeddings)
    """
    # ── Step 1: Extract keywords ────────────────────────────
    keywords = extract_keywords(request.resume_text)
    if request.job_title_hint:
        keywords.insert(0, request.job_title_hint)

    if not keywords:
        raise HTTPException(status_code=422, detail="Could not extract meaningful keywords from resume")

    # ── Step 2: Search Adzuna ───────────────────────────────
    raw_jobs = await search_jobs(
        keywords=keywords[:5],  # top 5 keywords as query
        location=request.location,

        max_results=request.max_results,
    )

    if not raw_jobs:
        return JobMatchResponse(
            query_keywords=keywords,
            total_found=0,
            matches=[],
        )

    # ── Step 3: Rank by embedding similarity ────────────────
    ranked = rank_jobs(request.resume_text, raw_jobs)

    matches = [
        JobMatch(
            title=j.get("title", ""),
            company=j.get("company", ""),
            location=j.get("location", ""),
            salary_min=j.get("salary_min"),
            salary_max=j.get("salary_max"),
            description=j.get("description", "")[:300],
            url=j.get("url", ""),
            match_score=round(j.get("match_score", 0.0), 4),
        )
        for j in ranked
    ]

    return JobMatchResponse(
        query_keywords=keywords,
        total_found=len(matches),
        matches=matches,
    )
