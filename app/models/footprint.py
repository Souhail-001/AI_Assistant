"""Pydantic models for the Digital Footprint feature."""

from typing import List, Optional
from pydantic import BaseModel, Field


# ── Request ─────────────────────────────────────────────────
class FootprintRequest(BaseModel):
    """Input payload for the /footprint/generate endpoint."""
    github_username: Optional[str] = Field(
        None,
        examples=["octocat"],
        description="GitHub username to scan.",
    )
    linkedin_url: Optional[str] = Field(
        None,
        examples=["https://linkedin.com/in/johndoe"],
        description="Full LinkedIn profile URL.",
    )


# ── GitHub sub-models ───────────────────────────────────────
class GitHubRepo(BaseModel):
    """Condensed info about a single GitHub repository."""
    name: str
    description: Optional[str] = ""
    language: Optional[str] = ""
    stars: int = 0
    forks: int = 0
    url: str = ""


class GitHubProfile(BaseModel):
    """Aggregated GitHub profile data."""
    username: str
    bio: Optional[str] = ""
    public_repos: int = 0
    followers: int = 0
    following: int = 0
    top_languages: List[str] = []
    top_repos: List[GitHubRepo] = []
    total_stars: int = 0


# ── LinkedIn sub-model ──────────────────────────────────────
class LinkedInProfile(BaseModel):
    """Aggregated LinkedIn profile data."""
    name: str
    headline: Optional[str] = ""
    summary: Optional[str] = ""
    location: Optional[str] = ""
    experience: List[str] = []
    skills: List[str] = []


# ── Response ────────────────────────────────────────────────
class FootprintSummary(BaseModel):
    """Combined footprint summary returned to the client."""
    github: Optional[GitHubProfile] = None
    linkedin: Optional[LinkedInProfile] = None
    combined_skills: List[str] = []
    profile_strength: float = Field(
        0.0,
        ge=0.0,
        le=100.0,
        description="Overall profile strength score (0-100).",
    )
    summary_text: str = Field(
        "",
        description="Human-readable footprint summary.",
    )
