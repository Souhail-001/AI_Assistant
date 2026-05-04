"""AI Interviewer API endpoints — full interview session lifecycle."""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.db.session import get_db
from app.models.user import User
from app.services.history_service import save_interview_history
from app.core.security import get_current_username
from app.services import interview as svc

router = APIRouter(dependencies=[Depends(get_current_username)])


# ── Request / Response Schemas ───────────────────────────────
class StartRequest(BaseModel):
    job_role: str
    difficulty: str = "medium"


class AnswerRequest(BaseModel):
    answer: str


class StartResponse(BaseModel):
    session_id: str
    question: str
    question_number: int
    total_questions: int
    audio_base64: Optional[str] = None


class AnswerResponse(BaseModel):
    feedback: str
    next_question: Optional[str] = None
    question_number: int
    is_last: bool
    audio_base64: Optional[str] = None


class EndResponse(BaseModel):
    final_feedback: str
    score: Optional[int] = None
    total_questions: int
    questions_answered: int


class StatusResponse(BaseModel):
    session_id: str
    job_role: str
    difficulty: str
    state: str
    current_question: Optional[str] = None
    question_number: int
    total_max_questions: int


# ── Endpoints ────────────────────────────────────────────────
@router.post("/start", response_model=StartResponse)
async def start_interview(req: StartRequest):
    """Create a new interview session and return the first question."""
    try:
        session, first_question = svc.create_session(req.job_role, req.difficulty)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Try TTS for the first question
    audio_b64 = None
    try:
        audio_bytes = await svc.synthesize_speech(first_question)
        audio_b64 = svc.audio_to_base64(audio_bytes)
    except Exception:
        pass  # TTS is optional; continue without audio

    return StartResponse(
        session_id=session.session_id,
        question=first_question,
        question_number=1,
        total_questions=svc.MAX_QUESTIONS,
        audio_base64=audio_b64,
    )


@router.post("/{session_id}/answer", response_model=AnswerResponse)
async def submit_text_answer(session_id: str, req: AnswerRequest):
    """Submit a text answer, receive feedback and the next question."""
    try:
        result = svc.submit_answer(session_id, req.answer)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Try TTS for next question
    audio_b64 = None
    if result.get("next_question"):
        try:
            audio_bytes = await svc.synthesize_speech(result["next_question"])
            audio_b64 = svc.audio_to_base64(audio_bytes)
        except Exception:
            pass

    return AnswerResponse(
        feedback=result["feedback"],
        next_question=result.get("next_question"),
        question_number=result["question_number"],
        is_last=result["is_last"],
        audio_base64=audio_b64,
    )


@router.post("/{session_id}/answer-audio", response_model=AnswerResponse)
async def submit_audio_answer(session_id: str, file: UploadFile = File(...)):
    """Submit an audio recording — transcribed via Deepgram STT, then evaluated."""
    # Validate session exists
    session = svc.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    # Read and transcribe audio
    audio_bytes = await file.read()
    content_type = file.content_type or "audio/webm"

    try:
        transcript = await svc.transcribe_audio(audio_bytes, content_type)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    if not transcript:
        raise HTTPException(status_code=400, detail="Could not transcribe audio. Please try again or use text input.")

    # Process the transcribed answer
    try:
        result = svc.submit_answer(session_id, transcript)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Try TTS for next question
    audio_b64 = None
    if result.get("next_question"):
        try:
            audio_bytes = await svc.synthesize_speech(result["next_question"])
            audio_b64 = svc.audio_to_base64(audio_bytes)
        except Exception:
            pass

    return AnswerResponse(
        feedback=result["feedback"],
        next_question=result.get("next_question"),
        question_number=result["question_number"],
        is_last=result["is_last"],
        audio_base64=audio_b64,
    )


@router.get("/{session_id}/question-audio")
async def get_question_audio(session_id: str):
    """Get the current question as TTS audio (MP3)."""
    session = svc.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    if not session.turns:
        raise HTTPException(status_code=400, detail="No question available")

    current_question = session.turns[-1].question
    try:
        audio_bytes = await svc.synthesize_speech(current_question)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=500, detail=str(e))

    return Response(content=audio_bytes, media_type="audio/mpeg")


@router.post("/{session_id}/end", response_model=EndResponse)
async def end_interview(
    session_id: str,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_username)
):
    """End the interview and receive a comprehensive final evaluation."""
    # Getting session strictly just to record the Job Role before ending invalidates it
    job_role = "Unknown"
    s = svc.get_session(session_id)
    if s:
        job_role = s.job_role

    try:
        result = svc.end_session(session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # Attempt to parse out Verdict from final feedback just for history storage
    import re
    verdict = "N/A"
    v_match = re.search(r"VERDICT:\s*(.*)", result["final_feedback"])
    if v_match:
        verdict = v_match.group(1).strip()
        
    user = db.query(User).filter(or_(User.email == email, User.username == email)).first()
    if user:
        save_interview_history(db, user.id, job_role, result.get("score") or 0, verdict[:50])

    return EndResponse(
        final_feedback=result["final_feedback"],
        score=result.get("score"),
        total_questions=result["total_questions"],
        questions_answered=result["questions_answered"],
    )


@router.get("/{session_id}/status", response_model=StatusResponse)
async def get_session_status(session_id: str):
    """Get current session state."""
    session = svc.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    current_q = session.turns[-1].question if session.turns else None

    return StatusResponse(
        session_id=session.session_id,
        job_role=session.job_role,
        difficulty=session.difficulty,
        state=session.state,
        current_question=current_q,
        question_number=len(session.turns),
        total_max_questions=svc.MAX_QUESTIONS,
    )
