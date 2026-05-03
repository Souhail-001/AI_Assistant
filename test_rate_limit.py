import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

# Force in-memory storage for testing without needing a real Redis container
os.environ["REDIS_URL"] = "memory://"
# Mock DB URL so sqlalchemy doesn't try to connect to postgres
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.main import app
from app.core.security import create_access_token

client = TestClient(app)

@patch("app.routers.review.process_cv_text")
def test_review_rate_limit(mock_process):
    # 1. Mock the heavy Groq call so we don't actually hit the API and wait
    mock_process.return_value = "Mocked review response"
    
    # 2. Create a valid token to bypass 401 Unauthorized
    token = create_access_token(subject="test_rate_limiter_user")
    headers = {"Authorization": f"Bearer {token}"}
    
    payload = {"resume_text": "sample resume", "job_description": "sample job"}
    
    # 3. The /api/v1/review/text endpoint allows 10 requests per minute
    # Send 10 successful requests
    for i in range(10):
        response = client.post("/api/v1/review/text", json=payload, headers=headers)
        assert response.status_code == 200, f"Request {i+1} failed prematurely: {response.text}"
        
    # 4. The 11th request MUST be blocked with a 429
    response = client.post("/api/v1/review/text", json=payload, headers=headers)
    assert response.status_code == 429
    assert response.json()["error"] == "rate_limit_exceeded"
    assert "retry_after" in response.json()
    print("Rate limit test passed successfully!")

