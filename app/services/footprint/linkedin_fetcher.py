"""LinkedIn profile fetcher (placeholder).

Scraping LinkedIn requires authentication / a paid API.
This module returns a stub so the rest of the app can run.
"""


async def fetch_linkedin_profile(linkedin_url: str) -> dict:
    """
    Placeholder — returns an empty profile.

    Replace with a real implementation (e.g. Proxycurl, RapidAPI,
    or Selenium scraper) when you have credentials.
    """
    return {
        "name": "",
        "headline": "",
        "summary": "",
        "location": "",
        "experience": [],
        "skills": [],
    }
