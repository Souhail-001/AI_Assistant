from fastapi import Request
from slowapi import Limiter
from limits.storage import RedisStorage

from app.config import get_settings
from app.core.security import decode_token

settings = get_settings()

def get_user_id_from_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        payload = decode_token(token, expected_type="access")
        if payload and "sub" in payload:
            return payload["sub"]
        elif payload and "email" in payload:
            return payload["email"]
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"

# Using memory:// by default for local dev/testing stability instead of strictly Redis right now to make pytest happy
limiter = Limiter(
    key_func=get_user_id_from_token,
    storage_uri="memory://",
)
