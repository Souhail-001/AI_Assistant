# AI Career Assistant Platform

## Features

| Feature | Description | Technologies |
|---------|-------------|-------------|
| **AI Resume Reviewer** | Upload/paste resume for instant RAG-powered analysis | Groq LLM, ChromaDB, LangChain |
| **AI Interviewer** | Real-time voice/text interview practice | Groq LLM, Deepgram STT/TTS |
| **Job Matcher** | Find matching jobs from your resume | Adzuna API, spaCy, sentence-transformers |
| **Digital Footprint** | Generate summary from GitHub & LinkedIn | SerpAPI, GitHub API |

## Environment Variables

Copy `.env.template` to `.env` and fill in your keys:

```env
GROQ_API_KEY="your-groq-api-key"
DEEPGRAM_API_KEY="your-deepgram-api-key"
SERPAPI_KEY="your-serpapi-key"
ADZUNA_APP_ID="your-adzuna-app-id"
ADZUNA_APP_KEY="your-adzuna-app-key"
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/ai_assistant
SECRET_KEY=change-me-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
```

## Running the Project

### Option 1: Docker (Recommended)

```bash
docker compose up -d
```

### Option 2: Local Development

```bash
# Create virtual env & install deps
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start PostgreSQL (ensure it's running on localhost:5432)

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Access the Application
- **Frontend App**: [http://localhost:8000/](http://localhost:8000/)
- **API Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### Stop the Application
```bash
docker compose down
```

## AI Interviewer — Feature Guide

### How It Works
1. **Start**: Select a job role and difficulty level, then click "Start Interview"
2. **Answer**: Respond via voice recording (Deepgram STT) or text input
3. **Feedback**: Get real-time feedback after each answer from Groq LLM
4. **Report**: End the interview to receive a comprehensive evaluation with score

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/interview/start` | Create session, get first question |
| `POST` | `/api/v1/interview/{id}/answer` | Submit text answer |
| `POST` | `/api/v1/interview/{id}/answer-audio` | Submit audio (STT → evaluate) |
| `GET` | `/api/v1/interview/{id}/question-audio` | Get question as TTS audio |
| `POST` | `/api/v1/interview/{id}/end` | End session, get final report |
| `GET` | `/api/v1/interview/{id}/status` | Get session state |

### Voice Mode
- Uses the browser's **MediaRecorder API** to capture audio
- Audio is sent to **Deepgram Nova-2** for transcription
- AI questions are converted to speech via **Deepgram Aura TTS**
- Requires microphone permission in the browser

### Text Mode
- Type answers directly in the text input
- No microphone or Deepgram API key required for text-only mode
