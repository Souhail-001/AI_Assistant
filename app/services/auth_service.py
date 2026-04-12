from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models.user import User


def register_user_service(username: str, password: str, db: Session):
    normalized_username = username.strip().lower()
    db_user = (
        db.query(User)
        .filter(func.lower(User.username) == normalized_username)
        .first()
    )
    if db_user:
        return None

    hashed_pwd = get_password_hash(password)
    new_user = User(username=normalized_username, email=normalized_username, hashed_password=hashed_pwd)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def login_user_service(username: str, password: str, db: Session):
    normalized_username = username.strip().lower()
    user = (
        db.query(User)
        .filter(func.lower(User.username) == normalized_username)
        .order_by(User.id.desc())
        .first()
    )
    if not user or not verify_password(password, user.hashed_password):
        return None

    access_token = create_access_token(subject=user.username)
    refresh_token = create_refresh_token(subject=user.username)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


def refresh_access_token_service(refresh_token: str, db: Session):
    payload = decode_token(refresh_token, expected_type="refresh")
    if not payload:
        return None

    username = payload.get("sub")
    if not username:
        return None

    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None

    access_token = create_access_token(subject=user.username)
    return {
        "access_token": access_token,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
