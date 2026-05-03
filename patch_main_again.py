import re
with open("app/main.py", "r") as f:
    content = f.read()

limiter_setup = """
# ── Rate Limiter Setup ──────────────────────────────────────
from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.core.limiter import limiter

app.add_middleware(SlowAPIMiddleware)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    retry_after = exc.headers.get("Retry-After", "")
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "You are sending requests too fast. Please wait before retrying.",
            "retry_after": retry_after
        }
    )

# ── CORS ─────────"""
content = content.replace("# ── CORS ─────────", limiter_setup)

with open("app/main.py", "w") as f:
    f.write(content)
