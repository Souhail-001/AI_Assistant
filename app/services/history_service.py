from sqlalchemy.orm import Session
from app.models.history import InterviewHistory, ReviewHistory

MAX_HISTORY_LIMIT = 3

def save_review_history(db: Session, user_id: int, job_desc_used: str, score: int, feedback_summary: str):
    new_record = ReviewHistory(
        user_id=user_id,
        job_desc_used=job_desc_used,
        score=score,
        feedback_summary=feedback_summary
    )
    db.add(new_record)
    db.commit()
    
    # Enforce limit of 3
    count = db.query(ReviewHistory).filter(ReviewHistory.user_id == user_id).count()
    if count > MAX_HISTORY_LIMIT:
        overflow = count - MAX_HISTORY_LIMIT
        # Find oldest ones
        oldest = db.query(ReviewHistory).filter(ReviewHistory.user_id == user_id).order_by(ReviewHistory.created_at.asc()).limit(overflow).all()
        for old in oldest:
            db.delete(old)
        db.commit()

def save_interview_history(db: Session, user_id: int, job_role: str, score: int, verdict: str):
    new_record = InterviewHistory(
        user_id=user_id,
        job_role=job_role,
        score=score,
        verdict=verdict
    )
    db.add(new_record)
    db.commit()
    
    # Enforce limit of 3
    count = db.query(InterviewHistory).filter(InterviewHistory.user_id == user_id).count()
    if count > MAX_HISTORY_LIMIT:
        overflow = count - MAX_HISTORY_LIMIT
        # Find oldest ones
        oldest = db.query(InterviewHistory).filter(InterviewHistory.user_id == user_id).order_by(InterviewHistory.created_at.asc()).limit(overflow).all()
        for old in oldest:
            db.delete(old)
        db.commit()
