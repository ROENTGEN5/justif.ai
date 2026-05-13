"""
Justif.ai — Index Builder Script
One-time script to build the FAISS vector index from the Philippine laws CSV.

Usage:
    cd backend
    python -m scripts.build_index

This will:
1. Load and chunk all 13,953 laws from the CSV
2. Embed each chunk using Gemini's text-embedding-004
3. Build a FAISS index for fast similarity search
4. Save the index and metadata to backend/data/
"""

import sys
import time
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

from google import genai
from app.services.rag import (
    load_and_chunk_csv,
    get_embeddings_batch,
    build_faiss_index,
    save_index,
    CSV_PATH,
    INDEX_PATH,
    METADATA_PATH,
)
from app.config import settings

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def main():
    print("=" * 60)
    print("  Justif.ai - RAG Index Builder")
    print("  Building FAISS index from Philippine laws CSV")
    print("=" * 60)
    print()

    # Verify API key
    if not settings.GEMINI_API_KEY:
        print("ERROR: GEMINI_API_KEY not set in .env file!")
        print("Please add your Gemini API key to backend/.env")
        sys.exit(1)

    # Verify CSV exists
    if not CSV_PATH.exists():
        print(f"ERROR: CSV not found at {CSV_PATH}")
        print("Please place final_clean_laws.csv in backend/data/")
        sys.exit(1)

    start_time = time.time()

    # Step 1: Load and chunk CSV
    print("[Step 1/4] Loading and chunking CSV (Limited to 10 laws for quick prototype)...")
    chunks = load_and_chunk_csv(max_laws=10)
    print(f"   [OK] Created {len(chunks)} chunks from the CSV")
    print()

    # Step 2: Extract texts for embedding
    print("[Step 2/4] Preparing texts for embedding...")
    texts = [chunk.text for chunk in chunks]
    print(f"   [OK] {len(texts)} texts ready for embedding")
    print()

    # Step 3: Generate embeddings
    print("[Step 3/4] Generating embeddings with Gemini...")
    print("   (This may take 15-30 minutes depending on the number of chunks)")
    print()

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    embeddings = get_embeddings_batch(client, texts, batch_size=100)
    print(f"   [OK] Generated {embeddings.shape[0]} embeddings (dim={embeddings.shape[1]})")
    print()

    # Step 4: Build and save FAISS index
    print("[Step 4/4] Building FAISS index...")
    index = build_faiss_index(embeddings)
    save_index(index, chunks)
    print(f"   [OK] Index saved to {INDEX_PATH}")
    print(f"   [OK] Metadata saved to {METADATA_PATH}")
    print()

    # Summary
    elapsed = time.time() - start_time
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    index_size_mb = os.path.getsize(INDEX_PATH) / (1024 * 1024)
    meta_size_mb = os.path.getsize(METADATA_PATH) / (1024 * 1024)

    print("=" * 60)
    print("  Index build complete!")
    print(f"  Time: {minutes}m {seconds}s")
    print(f"  Chunks: {len(chunks)}")
    print(f"  Index size: {index_size_mb:.1f} MB")
    print(f"  Metadata size: {meta_size_mb:.1f} MB")
    print("=" * 60)
    print()
    print("You can now start the FastAPI server:")
    print("  uvicorn app.main:app --reload")


if __name__ == "__main__":
    main()
