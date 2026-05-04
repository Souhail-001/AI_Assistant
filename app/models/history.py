from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base

class InterviewHistory(Base):
    __tablename__ = "interview_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_role = Column(String)
    score = Column(Integer, nullable=True)
    verdict = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # user = relationship("User", back_populates="interviews")


class ReviewHistory(Base):
    __tablename__ = "review_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_desc_used = Column(String, nullable=True)
    score = Column(Integer, nullable=True)
    feedback_summary = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # user = relationship("User", back_populates="reviews")
