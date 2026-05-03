with open("app/routers/review.py", "r") as f:
    text = f.read()

# Add imports
text = text.replace("from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends", "from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request\nfrom app.core.limiter import limiter")

text = text.replace("async def review_text(request: ReviewTextRequest):", "@limiter.limit(\"10/minute\")\nasync def review_text(request: Request, body_req: ReviewTextRequest):")
text = text.replace("process_cv_text(request.resume_text, request.job_description)", "process_cv_text(body_req.resume_text, body_req.job_description)")

with open("app/routers/review.py", "w") as f:
    f.write(text)
