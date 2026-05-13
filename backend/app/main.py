"""
Justif.ai — FastAPI Backend
"Ang iyong munting Abogado"

Main application entry point with RAG system initialization.
Run with: uvicorn app.main:app --reload
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


# ─── Lifespan: Load RAG index on startup ────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the FAISS index and chunk metadata when the server starts."""
    logger.info("🚀 Starting Justif.ai API...")

    # Initialize the RAG service (loads FAISS index into memory)
    try:
        rag_service.initialize()
        if rag_service.is_ready:
            logger.info(
                f"✅ RAG service ready: {len(rag_service.chunks)} chunks loaded"
            )
        else:
            logger.warning(
                "⚠️  RAG index not found. Run 'python -m scripts.build_index' first."
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
        "and Google Gemini."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS Middleware ─────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
