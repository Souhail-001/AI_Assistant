with open("app/main.py", "r") as f:
    text = f.read()

# Fix slowapi standard where it throws without headers attribute if using older versions or different backends sometimes
fixed_handler = """@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    retry_after = "60" # Default static fallback to seconds if header is missing in mock/memory backend
    if hasattr(exc, 'headers') and exc.headers:
        retry_after = exc.headers.get("Retry-After", retry_after)
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "You are sending requests too fast. Please wait before retrying.",
            "retry_after": retry_after
        }
    )"""

old_handler = """@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    retry_after = exc.headers.get("Retry-After", "")
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "You are sending requests too fast. Please wait before retrying.",
            "retry_after": retry_after
        }
    )"""
text = text.replace(old_handler, fixed_handler)

with open("app/main.py", "w") as f:
    f.write(text)
