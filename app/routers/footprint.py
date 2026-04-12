"""Digital Footprint API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_username
from app.models.footprint import (
    FootprintRequest,
    FootprintSummary,
    GitHubProfile,
    GitHubRepo,
    LinkedInProfile,
)
from app.services.footprint.github_fetcher import fetch_github_profile
from app.services.footprint.linkedin_fetcher import fetch_linkedin_profile
from app.services.footprint.summarizer import generate_footprint_summary

router = APIRouter(dependencies=[Depends(get_current_username)])


@router.post("/generate", response_model=FootprintSummary)
async def generate_footprint(request: FootprintRequest):
    """
    Generate a digital footprint summary from GitHub and/or LinkedIn.

    Provide at least one of github_username or linkedin_url.
    """
    if not request.github_username and not request.linkedin_url:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of github_username or linkedin_url",
        )

    github_data = None
    linkedin_data = None

    # ── Fetch GitHub ────────────────────────────────────────
    if request.github_username:
        github_data = await fetch_github_profile(request.github_username)

    # ── Fetch LinkedIn ──────────────────────────────────────
    if request.linkedin_url:
        linkedin_data = await fetch_linkedin_profile(request.linkedin_url)

    # ── Summarize ───────────────────────────────────────────
    summary_data = generate_footprint_summary(github_data, linkedin_data)

    # Build response
    gh_profile = None
    if github_data and not github_data.get("error"):
        gh_repos = [
            GitHubRepo(**r) for r in github_data.get("top_repos", [])
        ]
        gh_profile = GitHubProfile(
            username=github_data.get("username", ""),
            bio=github_data.get("bio", ""),
            public_repos=github_data.get("public_repos", 0),
            followers=github_data.get("followers", 0),
            following=github_data.get("following", 0),
            top_languages=github_data.get("top_languages", []),
            top_repos=gh_repos,
            total_stars=github_data.get("total_stars", 0),
        )

    ln_profile = None
    if linkedin_data and linkedin_data.get("name"):
        ln_profile = LinkedInProfile(
            name=linkedin_data.get("name", ""),
            headline=linkedin_data.get("headline", ""),
            summary=linkedin_data.get("summary", ""),
            location=linkedin_data.get("location", ""),
            experience=linkedin_data.get("experience", []),
            skills=linkedin_data.get("skills", []),
        )

    return FootprintSummary(
        github=gh_profile,
        linkedin=ln_profile,
        combined_skills=summary_data["combined_skills"],
        profile_strength=summary_data["profile_strength"],
        summary_text=summary_data["summary_text"],
    )