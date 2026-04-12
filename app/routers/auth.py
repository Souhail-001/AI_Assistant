from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import REFRESH_TOKEN_EXPIRE_DAYS, get_current_username
from app.db.session import get_db
from app.models.schemas import TokenResponse, UserCreate, UserResponse
from app.services.auth_service import (
    login_user_service,
    refresh_access_token_service,
    register_user_service,
)

router = APIRouter()


@router.get("/me")
def get_current_user(username: str = Depends(get_current_username)):
    return {"username": username}


@router.post("/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    new_user = register_user_service(user.username, user.password, db)
    if new_user is None:
        raise HTTPException(status_code=400, detail="Account already exists")
    return new_user


@router.post("/login", response_model=TokenResponse)
def login_user(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    tokens = login_user_service(form_data.username, form_data.password, db)
    if tokens is None:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    response.set_cookie(
        key="refresh_token",
        value=tokens["refresh_token"],
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )
    return {
        "access_token": tokens["access_token"],
        "token_type": "bearer",
        "expires_in": tokens["expires_in"],
    }


@router.post("/refresh", response_model=TokenResponse)
def refresh_access_token(request: Request, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    refreshed = refresh_access_token_service(refresh_token, db)
    if not refreshed:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    return {
        "access_token": refreshed["access_token"],
        "token_type": "bearer",
        "expires_in": refreshed["expires_in"],
    }


@router.post("/logout")
def logout_user(response: Response):
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Logged out successfully"}
