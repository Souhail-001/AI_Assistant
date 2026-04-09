"""Build a combined footprint summary from GitHub + LinkedIn data."""

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


def _extract_skills(text: str) -> list[str]:
    tokens = set(re.split(r"[\s,|/\(\)\[\]]+", text.lower()))
    return sorted(KNOWN_TECH_SKILLS & tokens)


def generate_footprint_summary(
    github_data: dict | None,
    linkedin_data: dict | None,
) -> dict:
    """
    Return ``{"combined_skills": [...], "profile_strength": float, "summary_text": str}``.
    """
    combined_skills: set[str] = set()
    parts: list[str] = []
    strength = 0.0

    # ── GitHub signals ──────────────────────────────────────
    if github_data and not github_data.get("error"):
        gh_text_parts = [
            github_data.get("bio", ""),
            github_data.get("readme", ""),
        ]
        for repo in github_data.get("top_repos", []):
            gh_text_parts.append(repo.get("description", ""))
            gh_text_parts.append(repo.get("language", ""))

        gh_text = " ".join(filter(None, gh_text_parts))
        gh_skills = _extract_skills(gh_text)
        combined_skills.update(gh_skills)

        langs = github_data.get("top_languages", [])
        combined_skills.update(l.lower() for l in langs)

        github_summary = (
            f"GitHub: {github_data.get('public_repos', 0)} repos, "
            f"{github_data.get('total_stars', 0)} stars, "
            f"{github_data.get('followers', 0)} followers."
        )
        if github_data.get('bio'):
            github_summary += f" Bio: {github_data['bio']}."
        parts.append(github_summary)

        if langs:
            parts.append(f"Top languages: {', '.join(langs[:5])}.")

        top_repos = github_data.get('top_repos', [])
        if top_repos:
            repo_details = [f"{r['name']} ({r['stars']} stars)" for r in top_repos[:3]]
            parts.append(f"Top repositories: {', '.join(repo_details)}.")

        # strength bump from GitHub
        strength += min(30, github_data.get("public_repos", 0) * 1.5)
        strength += min(20, github_data.get("total_stars", 0) * 2)
        strength += min(10, github_data.get("followers", 0))

    # ── LinkedIn signals ────────────────────────────────────
    if linkedin_data and linkedin_data.get("name"):
        ln_skills = linkedin_data.get("skills", [])
        combined_skills.update(s.lower() for s in ln_skills)

        parts.append(
            f"LinkedIn: {linkedin_data.get('headline', '')}. "
            f"{len(ln_skills)} skills listed."
        )
        strength += min(20, len(ln_skills) * 2)
        strength += 10  # profile exists

    # normalise
    strength = min(strength, 100.0)
    if not parts:
        parts.append("No profile data available.")

    return {
        "combined_skills": sorted(combined_skills),
        "profile_strength": round(strength, 1),
        "summary_text": " | ".join(parts),
    }
