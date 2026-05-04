"""Resume Reviewer API endpoints."""

import os
import tempfile
import json
from typing import Optional
import re
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.db.session import get_db
from app.models.user import User
from app.services.history_service import save_review_history
from app.core.limiter import limiter
from pydantic import BaseModel
from app.core.security import get_current_username
from app.services.review import process_cv_review, process_cv_text

router = APIRouter(dependencies=[Depends(get_current_username)])

class ReviewTextRequest(BaseModel):
    resume_text: str
    job_description: Optional[str] = None


def _extract_review_score_and_summary(review_text: str) -> tuple[int, str]:
    score = 0
    summary = "Feedback generated."

    if not review_text:
        return score, summary

    score_match = re.search(r"OVERALL SCORE:\s*(\d{1,3})", review_text, re.IGNORECASE)
    if not score_match:
        score_match = re.search(r"OVERALL SCORE:\s*(\d{1,3})\s*/\s*100", review_text, re.IGNORECASE)
    if score_match:
        try:
            score = int(score_match.group(1))
        except ValueError:
            score = 0

    strengths_match = re.search(
        r"STRENGTHS:\s*(.*?)(?:\n\s*CRITICAL WEAKNESSES:|\n\s*REQUIRED IMPROVEMENTS:|\Z)",
        review_text,
        re.IGNORECASE | re.DOTALL,
    )
    if strengths_match:
        strengths_block = strengths_match.group(1).strip()
        bullet_lines = [line for line in strengths_block.splitlines() if line.strip().startswith("-")]
        if bullet_lines:
            summary = f"{len(bullet_lines)} Strengths identified."

    return score, summary

@router.post("/upload")
async def review_upload(
    file: UploadFile = File(...), 
    job_description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_username)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            content = await file.read()
            temp_pdf.write(content)
            temp_path = temp_pdf.name
            
        review_result = process_cv_review(temp_path, job_description)
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        score, summary_txt = _extract_review_score_and_summary(review_result)

        user = db.query(User).filter(or_(User.email == email, User.username == email)).first()
        if user:
            save_review_history(db, user.id, job_description or "N/A", score, summary_txt)
            
        return {"review": review_result}
        
    except Exception as e:
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        print("Error during /upload CV:", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/text")
@limiter.limit("10/minute")
async def review_text(
    request: Request, 
    body_req: ReviewTextRequest,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_username)
):
    try:
        review_result = process_cv_text(body_req.resume_text, body_req.job_description)
        
        score, summary_txt = _extract_review_score_and_summary(review_result)

        user = db.query(User).filter(or_(User.email == email, User.username == email)).first()
        if user:
            save_review_history(db, user.id, body_req.job_description or "N/A", score, summary_txt)
            
        return {"review": review_result}
    except Exception as e:
        print("Error during /text CV:", e)
        raise HTTPException(status_code=500, detail=str(e))
