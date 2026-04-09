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

    # SerpApi API
    SERPAPI_KEY: str = Field(default="f857442d2559c379e9c411d42c84905de80f3fc1b1bd3f608021366f4af878e6")
    
    

    # Google API for Generative AI
    GOOGLE_API_KEY: str = Field(default="")

    # XAI API
    XAI_API_KEY: str = Field(default="")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
