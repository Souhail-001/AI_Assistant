"""Application settings powered by pydantic-settings (env vars / .env)."""

from functools import lru_cache
from pydantic import Field

try:
    from pydantic_settings import BaseSettings
except ImportError:          # fallback if pydantic-settings is not installed
    from pydantic import BaseSettings  # type: ignore[no-redef]


class Settings(BaseSettings):
    APP_NAME: str = "AI Career Assistant"
    DEBUG: bool = False

    # Adzuna API
    ADZUNA_APP_ID: str = Field(default="cd917cf7")
    ADZUNA_APP_KEY: str = Field(default="a21530797f7814dd0000e514f93d98a2")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
