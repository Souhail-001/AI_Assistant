"""
AI Interviewer Service — Groq LLM for questions/evaluation, Deepgram for STT/TTS.

Manages interview sessions, generates contextual questions, evaluates answers,
and provides speech-to-text / text-to-speech via Deepgram.
"""

import os
import uuid
import time
import base64
import json
import httpx
from typing import Optional
from dataclasses import dataclass, field
from langchain_groq import ChatGroq
from langchain.schema import HumanMessage, SystemMessage

# ── Constants ────────────────────────────────────────────────
MAX_QUESTIONS = 6
SESSION_TTL_SECONDS = 1800

DEEPGRAM_STT_URL = "https://api.deepgram.com/v1/listen"
DEEPGRAM_TTS_URL = "https://api.deepgram.com/v1/speak"


# ── Session Data ─────────────────────────────────────────────
@dataclass
class InterviewTurn:
    question: str
    answer: Optional[str] = None
    feedback: Optional[str] = None


@dataclass
class InterviewSession:
    session_id: str
    job_role: str
    difficulty: str
    turns: list = field(default_factory=list)
    state: str = "active"          # active | completed
    created_at: float = field(default_factory=time.time)
    final_feedback: Optional[str] = None
    final_score: Optional[int] = None


# ── In-memory session store ──────────────────────────────────
_sessions: dict[str, InterviewSession] = {}


def _cleanup_expired():
    now = time.time()
    expired = [sid for sid, s in _sessions.items() if now - s.created_at > SESSION_TTL_SECONDS]
    for sid in expired:
        del _sessions[sid]


def get_session(session_id: str) -> InterviewSession | None:
    _cleanup_expired()
    return _sessions.get(session_id)


# ── Groq LLM helpers ────────────────────────────────────────
def _get_llm():
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("Missing GROQ_API_KEY in environment")
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0.7,
        groq_api_key=api_key,
        max_tokens=1024,
    )


def _build_system_prompt(role: str, difficulty: str) -> str:
    return f"""You are an expert technical interviewer conducting a {difficulty}-level interview for a {role} position.

RULES:
- Ask ONE focused question at a time.
- Questions should be relevant to the {role} role.
- Difficulty: {difficulty} — adjust complexity accordingly.
- Be professional but conversational.
- For "easy": focus on fundamentals and basic concepts.
- For "medium": include scenario-based and design questions.
- For "hard": include system design, edge cases, and deep-dive questions.
- Do NOT repeat questions already asked.
- Keep questions concise (2-3 sentences max)."""


def _build_conversation_context(session: InterviewSession) -> list:
    """Build LangChain message list from session history."""
    messages = [SystemMessage(content=_build_system_prompt(session.job_role, session.difficulty))]

    for turn in session.turns:
        messages.append(HumanMessage(content=f"[INTERVIEWER ASKED]: {turn.question}"))
        if turn.answer:
            messages.append(HumanMessage(content=f"[CANDIDATE ANSWERED]: {turn.answer}"))

    return messages


# ── Core Actions ─────────────────────────────────────────────
def create_session(job_role: str, difficulty: str) -> tuple[InterviewSession, str]:
    """Create a new session and generate the first question."""
    _cleanup_expired()

    session_id = str(uuid.uuid4())
    session = InterviewSession(session_id=session_id, job_role=job_role, difficulty=difficulty)

    # Generate first question
    llm = _get_llm()
    system_prompt = _build_system_prompt(job_role, difficulty)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content="Please start the interview. Ask your first question to the candidate."),
    ]
    response = llm.invoke(messages)
    first_question = response.content.strip()

    session.turns.append(InterviewTurn(question=first_question))
    _sessions[session_id] = session

    return session, first_question


def submit_answer(session_id: str, answer_text: str) -> dict:
    """Process a candidate answer, provide feedback, and generate next question."""
    session = get_session(session_id)
    if not session:
        raise ValueError("Session not found or expired")
    if session.state != "active":
        raise ValueError("Interview session is already completed")

    current_turn = session.turns[-1]
    if current_turn.answer is not None:
        raise ValueError("Answer already submitted for current question. Proceed to next or end.")

    current_turn.answer = answer_text

    llm = _get_llm()
    context = _build_conversation_context(session)

    # Evaluate answer
    eval_prompt = f"""The candidate just answered: "{answer_text}"

Provide:
1. Brief feedback on their answer (2-3 sentences — what was good, what could be improved).
2. Then ask the NEXT interview question.

Format your response EXACTLY like this:
FEEDBACK: <your feedback here>
QUESTION: <next question here>"""

    context.append(HumanMessage(content=eval_prompt))
    response = llm.invoke(context)
    raw = response.content.strip()

    # Parse feedback and question
    feedback = ""
    next_question = ""

    if "FEEDBACK:" in raw and "QUESTION:" in raw:
        parts = raw.split("QUESTION:")
        feedback = parts[0].replace("FEEDBACK:", "").strip()
        next_question = parts[1].strip() if len(parts) > 1 else ""
    else:
        # Fallback: treat entire response as feedback, generate question separately
        feedback = raw
        q_msgs = _build_conversation_context(session)
        q_msgs.append(HumanMessage(content="Ask the next interview question. Just the question, nothing else."))
        q_resp = llm.invoke(q_msgs)
        next_question = q_resp.content.strip()

    current_turn.feedback = feedback

    # Check if we should continue
    question_count = len(session.turns)
    is_last = question_count >= MAX_QUESTIONS

    result = {
        "feedback": feedback,
        "question_number": question_count,
        "is_last": is_last,
    }

    if not is_last and next_question:
        session.turns.append(InterviewTurn(question=next_question))
        result["next_question"] = next_question
    else:
        result["next_question"] = None
        result["is_last"] = True

    return result


def end_session(session_id: str) -> dict:
    """End the session and generate a comprehensive final feedback report."""
    session = get_session(session_id)
    if not session:
        raise ValueError("Session not found or expired")

    session.state = "completed"

    llm = _get_llm()
    context = _build_conversation_context(session)

    summary_prompt = """The interview is now complete. Based on all the candidate's answers, provide a comprehensive evaluation.

Format your response EXACTLY like this:

OVERALL SCORE: <number 0-100>/100
VERDICT: <STRONG / GOOD / NEEDS IMPROVEMENT / WEAK>

STRENGTHS:
- <strength 1>
- <strength 2>
- <strength 3>

AREAS FOR IMPROVEMENT:
- <area 1>
- <area 2>
- <area 3>

SUMMARY:
<2-3 sentence overall assessment of the candidate's performance>

RECOMMENDATION:
<1 sentence hire/no-hire recommendation>"""

    context.append(HumanMessage(content=summary_prompt))
    response = llm.invoke(context)
    final = response.content.strip()

    session.final_feedback = final

    # Try to extract score
    import re
    score_match = re.search(r"OVERALL SCORE:\s*(\d+)", final)
    if score_match:
        session.final_score = min(100, max(0, int(score_match.group(1))))

    return {
        "final_feedback": final,
        "score": session.final_score,
        "total_questions": len(session.turns),
        "questions_answered": sum(1 for t in session.turns if t.answer),
    }


# ── Deepgram STT ─────────────────────────────────────────────
async def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    """Transcribe audio bytes using Deepgram pre-recorded API."""
    api_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not api_key:
        raise ValueError("Missing DEEPGRAM_API_KEY in environment. STT is unavailable.")

    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": mime_type,
    }
    params = {
        "model": "nova-2",
        "language": "en",
        "smart_format": "true",
        "punctuate": "true",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(DEEPGRAM_STT_URL, headers=headers, params=params, content=audio_bytes)

    if resp.status_code != 200:
        raise RuntimeError(f"Deepgram STT error ({resp.status_code}): {resp.text}")

    data = resp.json()
    transcript = (
        data.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("transcript", "")
    )
    return transcript.strip()


# ── Deepgram TTS ─────────────────────────────────────────────
async def synthesize_speech(text: str) -> bytes:
    """Convert text to speech using Deepgram TTS. Returns audio bytes (mp3)."""
    api_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not api_key:
        raise ValueError("Missing DEEPGRAM_API_KEY in environment. TTS is unavailable.")

    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/json",
    }
    params = {
        "model": "aura-asteria-en",
    }
    body = {"text": text}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(DEEPGRAM_TTS_URL, headers=headers, params=params, json=body)

    if resp.status_code != 200:
        raise RuntimeError(f"Deepgram TTS error ({resp.status_code}): {resp.text}")

    return resp.content


def audio_to_base64(audio_bytes: bytes) -> str:
    """Encode audio bytes to base64 string for JSON transport."""
    return base64.b64encode(audio_bytes).decode("utf-8")
