"""
Justif.ai — Pinecone Index Builder Script
One-time script to embed Philippine laws with Ollama and upsert to Pinecone.

Prerequisites:
    1. Ollama running locally with nomic-embed-text pulled:
       ollama pull nomic-embed-text
    2. Pinecone API key and index name set in .env

Usage:
    cd backend
    python -m scripts.build_index

This will:
1. Load and chunk all 13,953 laws from the CSV
2. Embed each chunk using Ollama nomic-embed-text (768-dim)
3. Upsert vectors with metadata to Pinecone
"""

import sys
import time
import hashlib
import logging
import os
import io

# Fix Windows console encoding for Unicode output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import ollama
from pinecone import Pinecone, ServerlessSpec
from app.services.rag import (
    load_and_chunk_csv,
    embed_documents,
    CSV_PATH,
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
)
from app.config import settings

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─── Configuration ──────────────────────────────────────────

UPSERT_BATCH_SIZE = 100     # Vectors per Pinecone upsert call
EMBED_BATCH_SIZE = 50       # Texts per Ollama embed call


def generate_chunk_id(short_title: str, label: str, chunk_index: int) -> str:
    """Generate a deterministic, unique ID for a chunk."""
    raw = f"{short_title}|{label}|{chunk_index}"
    return hashlib.md5(raw.encode()).hexdigest()


def ensure_pinecone_index(pc: Pinecone, index_name: str) -> None:
    """Create the Pinecone index if it doesn't already exist."""
    existing = [idx.name for idx in pc.list_indexes()]
    if index_name in existing:
        print(f"   Pinecone index '{index_name}' already exists.")
        return

    print(f"   Creating Pinecone index '{index_name}'...")
    pc.create_index(
        name=index_name,
        dimension=EMBEDDING_DIM,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    )

    # Wait for the index to be ready
    print("   Waiting for index to become ready...")
    while not pc.describe_index(index_name).status.get("ready", False):
        time.sleep(2)
    print("   [OK] Index is ready.")


def main():
    print("=" * 60)
    print("  Justif.ai - Pinecone Index Builder")
    print("  Embedding with Ollama nomic-embed-text → Pinecone")
    print("=" * 60)
    print()

    # ── Verify prerequisites ────────────────────────────────

    # Pinecone API key
    if not settings.PINECONE_API_KEY:
        print("ERROR: PINECONE_API_KEY not set in .env file!")
        sys.exit(1)

    # CSV file
    if not CSV_PATH.exists():
        print(f"ERROR: CSV not found at {CSV_PATH}")
        print("Please place final_clean_laws.csv in backend/data/")
        sys.exit(1)

    # Ollama model
    print("[Pre-check] Verifying Ollama is running and model is available...")
    try:
        _ollama = ollama.Client(host=settings.OLLAMA_BASE_URL)
        _ollama.show(EMBEDDING_MODEL)
        print(f"   [OK] Ollama model '{EMBEDDING_MODEL}' is available")
    except Exception as e:
        print(f"ERROR: Ollama model '{EMBEDDING_MODEL}' not available: {e}")
        print(f"Run: ollama pull {EMBEDDING_MODEL}")
        sys.exit(1)
    print()

    start_time = time.time()

    # ── Step 1: Load and chunk CSV ──────────────────────────

    print("[Step 1/3] Loading and chunking all 13,953 laws from CSV...")
    chunks = load_and_chunk_csv()
    print(f"   [OK] Created {len(chunks)} chunks from the CSV")
    print()

    # ── Step 2: Connect to Pinecone ─────────────────────────

    print("[Step 2/3] Connecting to Pinecone...")
    pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    index_name = settings.PINECONE_INDEX_NAME
    ensure_pinecone_index(pc, index_name)
    index = pc.Index(index_name)
    print(f"   [OK] Connected to index '{index_name}'")
    print()

    # ── Step 3: Embed + Upsert ──────────────────────────────

    print("[Step 3/3] Embedding with Ollama and upserting to Pinecone...")
    print(f"   Embedding model: {EMBEDDING_MODEL} ({EMBEDDING_DIM}-dim)")
    print(f"   Embed batch size: {EMBED_BATCH_SIZE}")
    print(f"   Upsert batch size: {UPSERT_BATCH_SIZE}")
    print()

    total = len(chunks)
    upsert_buffer = []
    upserted_count = 0
    embed_errors = 0

    for i in range(0, total, EMBED_BATCH_SIZE):
        batch_chunks = chunks[i : i + EMBED_BATCH_SIZE]
        batch_texts = [c.text for c in batch_chunks]

        # Embed batch with Ollama
        try:
            embeddings = embed_documents(batch_texts)
        except Exception as e:
            logger.error(f"   Embedding error at batch {i}: {e}")
            embed_errors += 1
            continue

        # Prepare vectors for upsert
        for j, (chunk, embedding) in enumerate(zip(batch_chunks, embeddings)):
            vector_id = generate_chunk_id(chunk.short_title, chunk.label, chunk.chunk_index)

            # Truncate text to stay under Pinecone's 40KB metadata limit
            chunk_text = chunk.text[:8000] if len(chunk.text) > 8000 else chunk.text

            upsert_buffer.append({
                "id": vector_id,
                "values": embedding,
                "metadata": {
                    "short_title": chunk.short_title[:500],
                    "full_title": chunk.full_title[:500],
                    "law_type": chunk.law_type[:200],
                    "date": chunk.date[:50],
                    "url": chunk.url[:500],
                    "label": chunk.label[:200],
                    "chunk_index": chunk.chunk_index,
                    "total_chunks": chunk.total_chunks,
                    "text": chunk_text,
                },
            })

        # Upsert when buffer is full
        while len(upsert_buffer) >= UPSERT_BATCH_SIZE:
            batch_to_upsert = upsert_buffer[:UPSERT_BATCH_SIZE]
            upsert_buffer = upsert_buffer[UPSERT_BATCH_SIZE:]

            try:
                index.upsert(vectors=batch_to_upsert)
                upserted_count += len(batch_to_upsert)
            except Exception as e:
                logger.error(f"   Upsert error: {e}")

        # Progress update
        processed = min(i + EMBED_BATCH_SIZE, total)
        if (i // EMBED_BATCH_SIZE) % 20 == 0 or processed == total:
            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0
            eta = (total - processed) / rate if rate > 0 else 0
            print(
                f"   Progress: {processed}/{total} chunks embedded, "
                f"{upserted_count} upserted | "
                f"Rate: {rate:.0f} chunks/s | "
                f"ETA: {eta / 60:.1f} min"
            )

    # Flush remaining upsert buffer
    if upsert_buffer:
        try:
            index.upsert(vectors=upsert_buffer)
            upserted_count += len(upsert_buffer)
        except Exception as e:
            logger.error(f"   Final upsert error: {e}")

    print()

    # ── Summary ─────────────────────────────────────────────

    elapsed = time.time() - start_time
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    # Get index stats
    stats = index.describe_index_stats()

    print("=" * 60)
    print("  Index build complete!")
    print(f"  Time: {minutes}m {seconds}s")
    print(f"  Chunks processed: {total}")
    print(f"  Vectors upserted: {upserted_count}")
    print(f"  Embedding errors: {embed_errors}")
    print(f"  Total vectors in Pinecone: {stats.total_vector_count}")
    print("=" * 60)
    print()
    print("You can now start the FastAPI server:")
    print("  uvicorn app.main:app --reload")


if __name__ == "__main__":
    main()
