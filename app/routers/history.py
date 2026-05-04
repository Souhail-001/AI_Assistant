from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.db.session import get_db
from app.models.user import User
from app.models.history import InterviewHistory, ReviewHistory
from app.core.security import get_current_username
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter(dependencies=[Depends(get_current_username)])

class InterviewHistoryResponse(BaseModel):
    id: int
    job_role: str
    score: Optional[int]
    verdict: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class ReviewHistoryResponse(BaseModel):
    id: int
    job_desc_used: str
    score: Optional[int]
    feedback_summary: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class HistorySummaryResponse(BaseModel):
    interviews: List[InterviewHistoryResponse]
    reviews: List[ReviewHistoryResponse]

@router.get("/", response_model=HistorySummaryResponse)
async def get_user_history(
    db: Session = Depends(get_db),
    email: str = Depends(get_current_username)
):
    user = db.query(User).filter(or_(User.email == email, User.username == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    interviews = (
        db.query(InterviewHistory)
        .filter(InterviewHistory.user_id == user.id)
        .order_by(InterviewHistory.created_at.desc())
        .limit(3)
        .all()
    )
    reviews = (
        db.query(ReviewHistory)
        .filter(ReviewHistory.user_id == user.id)
        .order_by(ReviewHistory.created_at.desc())
        .limit(3)
        .all()
    )

    return {
        "interviews": interviews,
        "reviews": reviews
    }
