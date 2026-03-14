"""Adzuna job-search API client."""

import asyncio
import time
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.config import get_settings

settings = get_settings()

ADZUNA_APP_ID = settings.ADZUNA_APP_ID
ADZUNA_APP_KEY = settings.ADZUNA_APP_KEY


def _build_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


async def search_jobs(
    keywords: list[str],
    location: Optional[str] = None,
    country: str = "fr",
    results_per_page: int = 10,
) -> list[dict]:
    """
    Search Adzuna for jobs matching *keywords* in the given *country*.

    Returns a list of dicts with keys:
      title, company, location, salary_min, salary_max, description, url
    """
    session = _build_session()
    query = " ".join(keywords)

    url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
    params = {
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_APP_KEY,
        "results_per_page": results_per_page,
        "what_or": query,
        "content-type": "application/json",
    }
    if location:
        params["where"] = location

    try:
        resp = session.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            return []

        data = resp.json()
        jobs = []
        for r in data.get("results", []):
            jobs.append(
                {
                    "title": r.get("title", ""),
                    "company": (r.get("company") or {}).get("display_name", ""),
                    "location": (r.get("location") or {}).get("display_name", ""),
                    "salary_min": r.get("salary_min"),
                    "salary_max": r.get("salary_max"),
                    "description": r.get("description", ""),
                    "url": r.get("redirect_url", ""),
                }
            )
        return jobs
    except Exception:
        return []
