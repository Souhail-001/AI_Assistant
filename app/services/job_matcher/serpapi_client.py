"""SerpApi google jobs client."""

from typing import Optional
from serpapi import GoogleSearch
from app.config import get_settings

settings = get_settings()

SERPAPI_KEY = settings.SERPAPI_KEY

async def search_jobs(
    keywords: list[str],
    location: Optional[str] = "Tunisia",
    max_results: int = 10,
) -> list[dict]:
    """
    Search Google Jobs using SerpApi for jobs matching *keywords* in Tunisia.
    
    Returns a list of dicts with keys:
      title, company, location, description, url
    """
    if not SERPAPI_KEY:
        print("SERPAPI_KEY is not set.")
        return []

    query = " ".join(keywords)
    
    params = {
      "engine": "google_jobs",
      "q": query,
      "hl": "en",
      "api_key": SERPAPI_KEY
    }
    
    if location:
        params["location"] = location
    else:
        params["location"] = "Tunisia"
        
    try:
        search = GoogleSearch(params)
        results = search.get_dict()
        
        jobs_results = results.get("jobs_results", [])
        
        jobs = []
        for r in jobs_results[:max_results]:
            jobs.append({
                "title": r.get("title", ""),
                "company": r.get("company_name", ""),
                "location": r.get("location", ""),
                "salary_min": None,
                "salary_max": None,
                "description": r.get("description", "")[:1000],
                "url": r.get("share_link", r.get("related_links", [{}])[0].get("link", "")) if r.get("share_link") or r.get("related_links") else ""
            })
        return jobs
    except Exception as e:
        print(f"SerpApi Error: {e}")
        return []
