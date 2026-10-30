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

    # DeepSeek (LLM Service)
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    DEEPSEEK_BASE_URL: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

    # Groq (Legacy LLM Service)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")

    # Pinecone (Vector Database)
    PINECONE_API_KEY: str = os.getenv("PINECONE_API_KEY", "")
    PINECONE_INDEX_NAME: str = os.getenv("PINECONE_INDEX_NAME", "justifai-laws")

    # Ollama (Embedding Server)
    # Embeddings: Nomic Cloud API (Production) & Ollama (Local Fallback)
    NOMIC_API_KEY: str = os.getenv("NOMIC_API_KEY", "")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    # auto/fastembed run the open model on this server without Nomic API fees.
    # Paid Nomic API use requires explicitly selecting "nomic".
    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "fastembed").lower()

    # Vision Service for Document Photos (Google Gemini)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_VISION_MODEL: str = os.getenv("GEMINI_VISION_MODEL", "gemini-3.8-flash")
    DOCUMENT_OCR_PRIMARY: str = os.getenv("DOCUMENT_OCR_PRIMARY", "deepseek").lower()

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
