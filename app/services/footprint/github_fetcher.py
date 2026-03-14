"""Fetch and aggregate a GitHub user's public profile data."""

import base64
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def _build_session(timeout: int = 10) -> requests.Session:
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


async def fetch_github_profile(username: str) -> dict:
    """
    Return a dict with profile info, top repos, languages, and total stars.
    Returns ``{"error": "..."}`` on failure.
    """
    session = _build_session()
    headers = {"Accept": "application/vnd.github.v3+json"}
    timeout = 10

    try:
        # ── Profile ─────────────────────────────────────────
        user_resp = session.get(
            f"https://api.github.com/users/{username}",
            headers=headers,
            timeout=timeout,
        )
        if user_resp.status_code != 200:
            return {"error": f"GitHub returned {user_resp.status_code}"}

        user = user_resp.json()

        # ── Profile README ──────────────────────────────────
        readme_text = ""
        try:
            readme_resp = session.get(
                f"https://api.github.com/repos/{username}/{username}/contents/README.md",
                headers=headers,
                timeout=timeout,
            )
            if readme_resp.status_code == 200:
                readme_text = base64.b64decode(
                    readme_resp.json()["content"]
                ).decode("utf-8")
        except Exception:
            pass

        # ── Repos ───────────────────────────────────────────
        repos_resp = session.get(
            f"https://api.github.com/users/{username}/repos?per_page=50&sort=updated",
            headers=headers,
            timeout=timeout,
        )
        repos = repos_resp.json() if repos_resp.status_code == 200 else []

        lang_counter: dict[str, int] = {}
        top_repos = []
        total_stars = 0

        for r in repos:
            lang = r.get("language") or ""
            stars = r.get("stargazers_count", 0)
            total_stars += stars
            if lang:
                lang_counter[lang] = lang_counter.get(lang, 0) + 1
            top_repos.append(
                {
                    "name": r.get("name", ""),
                    "description": r.get("description") or "",
                    "language": lang,
                    "stars": stars,
                    "forks": r.get("forks_count", 0),
                    "url": r.get("html_url", ""),
                }
            )

        # sort repos by stars desc, keep top 10
        top_repos.sort(key=lambda x: x["stars"], reverse=True)
        top_repos = top_repos[:10]

        top_languages = sorted(lang_counter, key=lang_counter.get, reverse=True)[:8]

        return {
            "username": username,
            "bio": user.get("bio") or "",
            "public_repos": user.get("public_repos", 0),
            "followers": user.get("followers", 0),
            "following": user.get("following", 0),
            "top_languages": top_languages,
            "top_repos": top_repos,
            "total_stars": total_stars,
            "readme": readme_text,
        }
    except Exception as exc:
        return {"error": str(exc)}
