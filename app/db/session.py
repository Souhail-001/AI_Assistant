import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import get_settings

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")
dotenv_config = dotenv_values(BASE_DIR / ".env")

settings = get_settings()
DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or dotenv_config.get("DATABASE_URL")
    or settings.DATABASE_URL
)
if not DATABASE_URL or not str(DATABASE_URL).strip():
    raise RuntimeError("DATABASE_URL is not set. Configure PostgreSQL URL in .env")

engine = create_engine(DATABASE_URL.strip(), pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
