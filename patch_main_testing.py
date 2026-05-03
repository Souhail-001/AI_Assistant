import re
with open("app/main.py", "r") as f:
    content = f.read()

# Hook the limiter middleware into main.py
limiter_setup_new = """
from slowapi.middleware import SlowAPIMiddleware
app.add_middleware(SlowAPIMiddleware)

app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
"""
content = content.replace("app.state.limiter = limiter\n\n@app.exception_handler(RateLimitExceeded)\nasync def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):", limiter_setup_new)

with open("app/main.py", "w") as f:
    f.write(content)
