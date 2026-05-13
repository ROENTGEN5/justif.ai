"""
Justif.ai — RAG (Retrieval-Augmented Generation) Service
Handles CSV loading, text chunking, embedding, and FAISS vector search
over 13,953 Philippine laws.
"""

import csv
import json
import os
import pickle
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import faiss
from google import genai
from app.config import settings

logger = logging.getLogger(__name__)

# ─── Configuration ──────────────────────────────────────────

DATA_DIR = Path(__file__).parent.parent.parent / "data"
CSV_PATH = DATA_DIR / "final_clean_laws.csv"
INDEX_PATH = DATA_DIR / "faiss_index.bin"
METADATA_PATH = DATA_DIR / "chunks_metadata.pkl"

EMBEDDING_MODEL = "gemini-embedding-001"
CHUNK_SIZE = 1000       # chars per chunk
CHUNK_OVERLAP = 200     # overlap between chunks
EMBEDDING_DIM = 3072    # dimension of gemini-embedding-001

# All available law type labels
LAW_TYPES = [
    "Republic Acts",
    "National Administrative Register",
    "Presidential Proclamations",
    "Presidential Decree",
    "Executive Orders",
    "Administrative Orders",
    "Batas Pambansa",
    "Memorandum Orders",
    "Official Gazette",
    "Decisions / Signed Resolutions",
    "Memorandum Circulars",
    "1934-35 ConCon",
]

# ─── Data Structures ────────────────────────────────────────


class ChunkMetadata:
    """Metadata for a single text chunk."""

    __slots__ = [
        "short_title", "full_title", "law_type", "date",
        "url", "label", "chunk_index", "total_chunks", "text"
    ]

    def __init__(
        self,
        short_title: str,
        full_title: str,
        law_type: str,
        date: str,
        url: str,
        label: str,
        chunk_index: int,
        total_chunks: int,
        text: str,
    ):
        self.short_title = short_title
        self.full_title = full_title
        self.law_type = law_type
        self.date = date
        self.url = url
        self.label = label
        self.chunk_index = chunk_index
        self.total_chunks = total_chunks
        self.text = text

    def to_dict(self) -> dict:
        return {
            "short_title": self.short_title,
            "full_title": self.full_title,
            "law_type": self.law_type,
            "date": self.date,
            "url": self.url,
            "label": self.label,
        }


class SearchResult:
    """A single search result from the RAG system."""

    def __init__(self, chunk: ChunkMetadata, score: float):
        self.chunk = chunk
        self.score = score

    def to_dict(self) -> dict:
        return {
            **self.chunk.to_dict(),
            "score": round(float(self.score), 4),
            "text_preview": self.chunk.text[:200] + "..." if len(self.chunk.text) > 200 else self.chunk.text,
        }


# ─── Chunking ───────────────────────────────────────────────


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split text into overlapping chunks of approximately chunk_size characters.
    Tries to break at sentence boundaries when possible.
    """
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # If not at the end, try to find a sentence boundary
        if end < len(text):
            # Look for sentence-ending punctuation near the end
            boundary = -1
            search_start = max(start + chunk_size - 200, start)
            for marker in [". ", ".\n", ";\n", ".\r\n"]:
                pos = text.rfind(marker, search_start, end + 100)
                if pos > boundary:
                    boundary = pos + len(marker)

            if boundary > start:
                end = boundary

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move start forward, accounting for overlap
        start = end - overlap if end < len(text) else end

    return chunks


def load_and_chunk_csv(csv_path: str = None, max_laws: int = None) -> list[ChunkMetadata]:
    """
    Load the Philippine laws CSV and chunk all texts.
    Returns a list of ChunkMetadata objects.
    """
    csv_path = csv_path or str(CSV_PATH)
    csv.field_size_limit(2**30)

    all_chunks: list[ChunkMetadata] = []
    total_laws = 0
    total_chunks_count = 0

    logger.info(f"Loading CSV from {csv_path}...")

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            if max_laws and total_laws >= max_laws:
                break

            total_laws += 1
            text = row["text"]
            label = row["label"]
            url = row.get("url", "")

            # Parse citation information
            try:
                citation = json.loads(row["citation_information"])
                short_title = citation.get("short_title", "")
                full_title = citation.get("title", "")
                law_type = citation.get("type", "")
                date = citation.get("date_of_enactment", citation.get("date_of_issuance", ""))
            except (json.JSONDecodeError, KeyError):
                short_title = ""
                full_title = ""
                law_type = ""
                date = ""

            # Create metadata header for each chunk (helps embedding quality)
            meta_header = f"[{short_title}] [{label}]"
            if date:
                meta_header += f" [{date}]"

            # Chunk the text
            text_chunks = chunk_text(text)

            for i, chunk_text_content in enumerate(text_chunks):
                # Prepend metadata to chunk for better embedding
                enriched_text = f"{meta_header}\n{chunk_text_content}"

                chunk = ChunkMetadata(
                    short_title=short_title,
                    full_title=full_title,
                    law_type=law_type,
                    date=date,
                    url=url,
                    label=label,
                    chunk_index=i,
                    total_chunks=len(text_chunks),
                    text=enriched_text,
                )
                all_chunks.append(chunk)
                total_chunks_count += 1

            if total_laws % 100 == 0:
                logger.info(f"  Processed {total_laws} laws, {total_chunks_count} chunks so far...")

    logger.info(f"Done: {total_laws} laws → {total_chunks_count} chunks")
    return all_chunks


# ─── Embedding ──────────────────────────────────────────────


def get_embeddings_batch(
    client: genai.Client,
    texts: list[str],
    batch_size: int = 100,
) -> np.ndarray:
    """
    Embed a list of texts using Gemini's embedding model.
    Processes in batches to respect API limits (15 RPM).
    """
    import time
    all_embeddings = []
    total = len(texts)

    for i in range(0, total, batch_size):
        batch = texts[i : i + batch_size]
        success = False
        retries = 3
        while not success and retries > 0:
            try:
                response = client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=batch,
                )
                batch_embeddings = [e.values for e in response.embeddings]
                all_embeddings.extend(batch_embeddings)
                success = True

                if (i // batch_size) % 10 == 0:
                    logger.info(f"  Embedded {min(i + batch_size, total)}/{total} chunks...")
                
                # Respect the 15 RPM limit (1 req every 4 seconds)
                time.sleep(4)

            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    logger.warning(f"  Rate limit hit at batch {i}. Sleeping for 60s...")
                    time.sleep(60)
                    retries -= 1
                else:
                    logger.error(f"  Embedding error at batch {i}: {e}")
                    break
        
        if not success:
            logger.error(f"  Failed batch {i} after retries. Filling with zeros.")
            for _ in batch:
                all_embeddings.append([0.0] * EMBEDDING_DIM)

    return np.array(all_embeddings, dtype=np.float32)


def embed_query(client: genai.Client, query: str) -> np.ndarray:
    """Embed a single query string."""
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=[query],
    )
    return np.array([response.embeddings[0].values], dtype=np.float32)


# ─── FAISS Index ────────────────────────────────────────────


def build_faiss_index(embeddings: np.ndarray) -> faiss.IndexFlatIP:
    """
    Build a FAISS index from embeddings.
    Uses Inner Product (cosine similarity after normalization).
    """
    # Normalize embeddings for cosine similarity
    faiss.normalize_L2(embeddings)

    # Build the index
    index = faiss.IndexFlatIP(EMBEDDING_DIM)
    index.add(embeddings)

    logger.info(f"Built FAISS index with {index.ntotal} vectors")
    return index


def save_index(index: faiss.IndexFlatIP, chunks: list[ChunkMetadata]):
    """Save the FAISS index and chunk metadata to disk."""
    os.makedirs(DATA_DIR, exist_ok=True)

    faiss.write_index(index, str(INDEX_PATH))
    logger.info(f"Saved FAISS index to {INDEX_PATH}")

    with open(METADATA_PATH, "wb") as f:
        pickle.dump(chunks, f)
    logger.info(f"Saved metadata to {METADATA_PATH}")


def load_index() -> tuple[faiss.IndexFlatIP, list[ChunkMetadata]]:
    """Load the FAISS index and chunk metadata from disk."""
    if not INDEX_PATH.exists() or not METADATA_PATH.exists():
        raise FileNotFoundError(
            f"RAG index not found. Run 'python -m scripts.build_index' first.\n"
            f"Expected: {INDEX_PATH} and {METADATA_PATH}"
        )

    index = faiss.read_index(str(INDEX_PATH))
    logger.info(f"Loaded FAISS index with {index.ntotal} vectors")

    with open(METADATA_PATH, "rb") as f:
        chunks = pickle.load(f)
    logger.info(f"Loaded {len(chunks)} chunk metadata entries")

    return index, chunks


# ─── Search ─────────────────────────────────────────────────


class RAGService:
    """
    RAG Service singleton.
    Loads the FAISS index once and handles all search requests.
    """

    def __init__(self):
        self.index: Optional[faiss.IndexFlatIP] = None
        self.chunks: Optional[list[ChunkMetadata]] = None
        self.client: Optional[genai.Client] = None
        self._loaded = False

    def initialize(self):
        """Load the index and initialize the embedding client."""
        if self._loaded:
            return

        try:
            self.index, self.chunks = load_index()
            self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
            self._loaded = True
            logger.info("RAG service initialized successfully.")
        except FileNotFoundError as e:
            logger.warning(f"RAG index not available: {e}")
            self._loaded = False

    @property
    def is_ready(self) -> bool:
        return self._loaded and self.index is not None

    def search(
        self,
        query: str,
        top_k: int = 5,
        law_types: Optional[list[str]] = None,
    ) -> list[SearchResult]:
        """
        Search for the most relevant law chunks for a given query.

        Args:
            query: The user's legal question.
            top_k: Number of results to return.
            law_types: Optional filter — only return chunks from these law categories.

        Returns:
            List of SearchResult objects, sorted by relevance.
        """
        if not self.is_ready:
            logger.warning("RAG service not initialized. Returning empty results.")
            return []

        # Embed the query
        query_embedding = embed_query(self.client, query)
        faiss.normalize_L2(query_embedding)

        # Search more than top_k if filtering, to ensure we get enough results
        search_k = top_k * 4 if law_types else top_k

        distances, indices = self.index.search(query_embedding, search_k)

        results = []
        for score, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(self.chunks):
                continue

            chunk = self.chunks[idx]

            # Apply law type filter
            if law_types and chunk.label not in law_types:
                continue

            results.append(SearchResult(chunk=chunk, score=score))

            if len(results) >= top_k:
                break

        return results

    def format_context(self, results: list[SearchResult]) -> str:
        """
        Format search results into a context string for the Gemini prompt.
        """
        if not results:
            return "Walang nakitang relevant na batas sa database."

        context_parts = []
        for i, result in enumerate(results, 1):
            chunk = result.chunk
            context_parts.append(
                f"--- Law Source {i} ---\n"
                f"Title: {chunk.short_title or chunk.full_title}\n"
                f"Type: {chunk.label}\n"
                f"Date: {chunk.date or 'N/A'}\n"
                f"URL: {chunk.url}\n"
                f"Content:\n{chunk.text}\n"
            )

        return "\n".join(context_parts)

    def get_sources(self, results: list[SearchResult]) -> list[dict]:
        """
        Extract unique source citations from search results.
        Deduplicates by short_title.
        """
        seen = set()
        sources = []

        for result in results:
            key = result.chunk.short_title or result.chunk.full_title
            if key and key not in seen:
                seen.add(key)
                sources.append(result.chunk.to_dict())

        return sources


# ─── Singleton Instance ─────────────────────────────────────

rag_service = RAGService()
