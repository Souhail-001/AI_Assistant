"""Resume Reviewer API endpoints."""

import os
import tempfile
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from app.core.limiter import limiter
from pydantic import BaseModel
from app.core.security import get_current_username
from app.services.review import process_cv_review, process_cv_text

router = APIRouter(dependencies=[Depends(get_current_username)])

class ReviewTextRequest(BaseModel):
    resume_text: str
    job_description: Optional[str] = None

@router.post("/upload")
async def review_upload(file: UploadFile = File(...), job_description: Optional[str] = Form(None)):
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
            
        return {"review": review_result}
        
    except Exception as e:
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        print("Error during /upload CV:", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/text")
@limiter.limit("10/minute")
async def review_text(request: Request, body_req: ReviewTextRequest):
    try:
        review_result = process_cv_text(body_req.resume_text, body_req.job_description)
        return {"review": review_result}
    except Exception as e:
        print("Error during /text CV:", e)
        raise HTTPException(status_code=500, detail=str(e))
