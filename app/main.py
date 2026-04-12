"""
AI Career Assistant Platform — Main FastAPI Application.

Run with:
    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from app.db.base import Base
from app.db.session import engine

from app.config import get_settings
from app.routers import review, interview, jobs, footprint,auth

settings = get_settings()

# ── App ─────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Unified AI-powered career assistant platform with Resume Reviewing, "
        "AI Interviewing, Job Matching, and Digital Footprint Summary."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
Base.metadata.create_all(bind=engine)

# ── Routers ─────────────────────────────────────────────────
app.include_router(review.router,       prefix="/api/v1/review",      tags=["Resume Reviewer"])
app.include_router(interview.router,    prefix="/api/v1/interview",   tags=["AI Interviewer"])
app.include_router(jobs.router,         prefix="/api/v1/jobs",        tags=["Job Matcher"])
app.include_router(footprint.router,    prefix="/api/v1/footprint",   tags=["Digital Footprint"])
app.include_router(auth.router,    prefix="/api/v1/auth",   tags=["authentication"])



# ── Health check ────────────────────────────────────────────
@app.get("/api/health", tags=["System"])
async def health_check():
    """Quick health check endpoint."""
    return {"status": "ok", "app": settings.APP_NAME}


# ── Serve frontend (must be last) ──────────────────────────
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
