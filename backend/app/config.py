"""
Justif.ai Backend Configuration
Loads environment variables via python-dotenv
"""

import os
from dotenv import load_dotenv

# Load .env file from the backend directory
load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # Groq (Llama 4 Scout)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    # Pinecone (Vector Database)
    PINECONE_API_KEY: str = os.getenv("PINECONE_API_KEY", "")
    PINECONE_INDEX_NAME: str = os.getenv("PINECONE_INDEX_NAME", "justifai-laws")

    # Ollama (Embedding Server)
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    # CORS
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")

    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Security
    DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
    RATE_LIMIT: str = os.getenv("RATE_LIMIT", "30/minute")

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


settings = Settings()
