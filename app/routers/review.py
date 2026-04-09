"""Resume Reviewer API endpoints."""

import os
import tempfile
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from app.services.review import process_cv_review, process_cv_text

router = APIRouter()

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
async def review_text(request: ReviewTextRequest):
    try:
        review_result = process_cv_text(request.resume_text, request.job_description)
        return {"review": review_result}
    except Exception as e:
        print("Error during /text CV:", e)
        raise HTTPException(status_code=500, detail=str(e))
