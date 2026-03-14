"""Pydantic models for the Job Matcher feature."""

from typing import List, Optional
from pydantic import BaseModel, Field


# ── Request ─────────────────────────────────────────────────
class JobMatchRequest(BaseModel):
    """Input payload for the /jobs/match endpoint."""
    resume_text: str = Field(
        ...,
        min_length=50,
        description="Plain-text content of the user's resume / CV.",
    )
    job_title_hint: Optional[str] = Field(
        None,
        examples=["Junior AI Engineer"],
        description="Optional job title to bias the search.",
    )
    location: Optional[str] = Field(
        None,
        examples=["Paris"],
        description="Preferred job location.",
    )
    country: str = Field(
        "fr",
        examples=["fr", "gb", "de", "us"],
        description="ISO-3166-1 alpha-2 country code for Adzuna search.",
    )
    max_results: int = Field(
        10,
        ge=1,
        le=50,
        description="Maximum number of job results to return.",
    )


# ── Single job match ───────────────────────────────────────
class JobMatch(BaseModel):
    """A single job listing with its similarity score."""
    title: str
    company: str = ""
    location: str = ""
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    description: str = Field(
        "",
        description="Truncated job description (≤300 chars).",
    )
    url: str = ""
    match_score: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Cosine-similarity score between resume and job.",
    )


# ── Response ────────────────────────────────────────────────
class JobMatchResponse(BaseModel):
    """Aggregated response for the job matching endpoint."""
    query_keywords: List[str] = Field(
        default_factory=list,
        description="Keywords extracted from the resume.",
    )
    total_found: int = 0
    matches: List[JobMatch] = []
