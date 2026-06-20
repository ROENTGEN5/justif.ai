"""
Justif.ai — FastAPI Backend
"Ang iyong munting Abogado"

Main application entry point with RAG system initialization.
Run with: uvicorn app.main:app --reload
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings
from app.routes.chat import router as chat_router
from app.models.schemas import HealthResponse
from app.services.rag import rag_service

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ─── Rate Limiter ────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT])


# ─── Security Headers Middleware ─────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Only add HSTS in production
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


# ─── Lifespan: Connect to Pinecone on startup ───────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect to Pinecone vector database and verify Ollama when the server starts."""
    logger.info("🚀 Starting Justif.ai API...")

    # Initialize the RAG service (connects to Pinecone + checks Ollama)
    try:
        rag_service.initialize()
        if rag_service.is_ready:
            logger.info(
                f"✅ RAG service ready: {len(rag_service.chunks)} vectors in Pinecone"
            )
        else:
            logger.warning(
                "⚠️  RAG service not ready. Check Pinecone API key and run 'python -m scripts.build_index' first."
            )
    except Exception as e:
        logger.error(f"❌ Failed to initialize RAG service: {e}")

    yield  # App is running

    logger.info("👋 Shutting down Justif.ai API...")


# ─── App Initialization ──────────────────────────────────────

app = FastAPI(
    title="Justif.ai API",
    description=(
        "Justif.ai — Ang iyong munting Abogado. "
        "A Filipino legal AI assistant powered by RAG over 13,953 Philippine laws "
        "and Groq Llama 4 Scout."
    ),
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# Attach rate limiter to the app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Security Headers Middleware ─────────────────────────────

app.add_middleware(SecurityHeadersMiddleware)

# ─── CORS Middleware ─────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Bypass-Tunnel-Reminder"],
)

# ─── Routes ──────────────────────────────────────────────────

app.include_router(chat_router)


@app.get("/", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(rag_ready=rag_service.is_ready)


@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
async def api_health():
    """API health check endpoint."""
    return HealthResponse(rag_ready=rag_service.is_ready)


# ─── Run Server ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
