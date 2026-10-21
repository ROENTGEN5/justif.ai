"""
Justif.ai — RAG (Retrieval-Augmented Generation) Service
Handles CSV loading, text chunking, Nomic Cloud / Ollama embedding, and Pinecone vector search
over 13,953 Philippine laws.

Vector DB: Pinecone (serverless)
Embeddings: Nomic Cloud API (nomic-embed-text-v1.5) or Ollama nomic-embed-text (768-dim)
"""

import csv
import json
import logging
from pathlib import Path
from typing import Optional

import httpx
import ollama
from pinecone import Pinecone
from app.config import settings

logger = logging.getLogger(__name__)

# ─── Configuration ──────────────────────────────────────────

DATA_DIR = Path(__file__).parent.parent.parent / "data"
CSV_PATH = DATA_DIR / "final_clean_laws.csv"

EMBEDDING_MODEL = "nomic-embed-text"
NOMIC_CLOUD_MODEL = "nomic-embed-text-v1.5"
NOMIC_EMBED_URL = "https://api-atlas.nomic.ai/v1/embedding/text"
EMBEDDING_DIM = 768         # dimension of nomic-embed-text
CHUNK_SIZE = 1000           # chars per chunk
CHUNK_OVERLAP = 200         # overlap between chunks

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


# ─── Embedding (Nomic Cloud API + Ollama Fallback) ──────────


# Ollama client — initialized with configurable host
_ollama_client = ollama.Client(host=settings.OLLAMA_BASE_URL)


def _embed_via_nomic_api(texts: list[str], task_type: str = "search_query") -> list[list[float]]:
    """
    Embed texts using Nomic Atlas Cloud REST API (nomic-embed-text-v1.5, 768-dim).
    Produces embeddings directly compatible with vectors generated by Ollama's nomic-embed-text.
    """
    headers = {
        "Authorization": f"Bearer {settings.NOMIC_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": NOMIC_CLOUD_MODEL,
        "texts": texts,
        "task_type": task_type,
        "dimensionality": EMBEDDING_DIM,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(NOMIC_EMBED_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["embeddings"]


def embed_query(text: str) -> list[float]:
    """
    Embed a single query string into a 768-dim vector.
    Uses Nomic Cloud API when NOMIC_API_KEY is set (for cloud deployments like Render),
    and falls back to local Ollama nomic-embed-text.
    """
    if settings.NOMIC_API_KEY:
        try:
            embeddings = _embed_via_nomic_api([text], task_type="search_query")
            return embeddings[0]
        except Exception as e:
            logger.warning(f"Nomic Cloud API embedding failed, falling back to Ollama: {e}")

    response = _ollama_client.embed(
        model=EMBEDDING_MODEL,
        input=f"search_query: {text}",
    )
    return response["embeddings"][0]


def embed_documents(texts: list[str]) -> list[list[float]]:
    """
    Embed a batch of document texts into 768-dim vectors.
    Uses Nomic Cloud API when NOMIC_API_KEY is set, otherwise local Ollama.
    """
    if settings.NOMIC_API_KEY:
        try:
            return _embed_via_nomic_api(texts, task_type="search_document")
        except Exception as e:
            logger.warning(f"Nomic Cloud API document embedding failed, falling back to Ollama: {e}")

    prefixed = [f"search_document: {t}" for t in texts]
    response = _ollama_client.embed(
        model=EMBEDDING_MODEL,
        input=prefixed,
    )
    return response["embeddings"]


# ─── Pinecone Search ───────────────────────────────────────


class RAGService:
    """
    RAG Service singleton.
    Connects to Pinecone index and handles all search requests.
    Uses Nomic Cloud API or Ollama nomic-embed-text for query embedding.
    """

    def __init__(self):
        self.index = None
        self._total_vectors: int = 0
        self._loaded = False

    def initialize(self):
        """Connect to Pinecone index and verify embedding service is available."""
        if self._loaded:
            return

        try:
            # Connect to Pinecone
            if not settings.PINECONE_API_KEY:
                logger.warning("PINECONE_API_KEY not set. RAG service disabled.")
                return

            pc = Pinecone(api_key=settings.PINECONE_API_KEY)
            self.index = pc.Index(settings.PINECONE_INDEX_NAME)

            # Get index stats to verify connection
            stats = self.index.describe_index_stats()
            self._total_vectors = stats.total_vector_count
            logger.info(
                f"Connected to Pinecone index '{settings.PINECONE_INDEX_NAME}' "
                f"with {self._total_vectors} vectors"
            )

            # Check embedding provider availability
            if settings.NOMIC_API_KEY:
                logger.info(f"Using Nomic Cloud API ('{NOMIC_CLOUD_MODEL}') for query embeddings")
            else:
                try:
                    _ollama_client.show(EMBEDDING_MODEL)
                    logger.info(f"Ollama model '{EMBEDDING_MODEL}' is available locally")
                except Exception as e:
                    logger.warning(
                        f"Neither NOMIC_API_KEY is set nor local Ollama model '{EMBEDDING_MODEL}' is reachable ({e}). "
                        f"Set NOMIC_API_KEY for cloud deployment or run 'ollama pull {EMBEDDING_MODEL}' locally."
                    )

            self._loaded = True
            logger.info("RAG service initialized successfully.")

        except Exception as e:
            logger.error(f"Failed to initialize RAG service: {e}")
            self._loaded = False

    @property
    def is_ready(self) -> bool:
        return self._loaded and self.index is not None

    @property
    def chunks(self) -> Optional[list]:
        """
        Compatibility property — returns a list-like object with correct length.
        Used by /api/rag/status endpoint to report total_chunks.
        """
        if self._total_vectors > 0:
            return [None] * self._total_vectors
        return None

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

        try:
            # Embed the query using Nomic Cloud API or Ollama
            query_embedding = embed_query(query)

            # Build Pinecone metadata filter
            pinecone_filter = None
            if law_types:
                pinecone_filter = {"label": {"$in": law_types}}

            # Query Pinecone
            query_response = self.index.query(
                vector=query_embedding,
                top_k=top_k,
                include_metadata=True,
                filter=pinecone_filter,
            )

            # Convert Pinecone results to SearchResult objects
            results = []
            for match in query_response.matches:
                meta = match.metadata or {}
                chunk = ChunkMetadata(
                    short_title=meta.get("short_title", ""),
                    full_title=meta.get("full_title", ""),
                    law_type=meta.get("law_type", ""),
                    date=meta.get("date", ""),
                    url=meta.get("url", ""),
                    label=meta.get("label", ""),
                    chunk_index=meta.get("chunk_index", 0),
                    total_chunks=meta.get("total_chunks", 1),
                    text=meta.get("text", ""),
                )
                results.append(SearchResult(chunk=chunk, score=match.score))

            return results

        except Exception as e:
            logger.error(f"RAG search error: {e}", exc_info=True)
            return []

    def format_context(self, results: list[SearchResult]) -> str:
        """
        Format search results into a context string for the LLM prompt.
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

    def format_context_from_sources(
        self,
        results: list[SearchResult],
        deduplicated_sources: list[dict],
    ) -> str:
        """
        Format context for the LLM using deduplicated source numbering.

        Groups chunks by their source title and numbers them to match
        the deduplicated sources list, so "Source 1" in the AI's context
        corresponds exactly to Source 1 in the user's SourceCard.
        """
        if not results:
            return "Walang nakitang relevant na batas sa database."

        # Map each deduplicated source to its index (1-based)
        source_index_map: dict[str, int] = {}
        for i, src in enumerate(deduplicated_sources):
            key = src.get("short_title") or src.get("full_title", "")
            if key and key not in source_index_map:
                source_index_map[key] = i + 1

        # Build context grouped by source number
        context_parts = []
        seen_sources: set[int] = set()

        for result in results:
            chunk = result.chunk
            key = chunk.short_title or chunk.full_title
            source_num = source_index_map.get(key)
            if source_num is None:
                continue

            # Only add the header once per unique source
            if source_num not in seen_sources:
                seen_sources.add(source_num)
                context_parts.append(
                    f"--- Law Source {source_num} ---\n"
                    f"Title: {chunk.short_title or chunk.full_title}\n"
                    f"Type: {chunk.label}\n"
                    f"Date: {chunk.date or 'N/A'}\n"
                    f"URL: {chunk.url}\n"
                    f"Content:\n{chunk.text}\n"
                )
            else:
                # Additional chunks from the same source — append content only
                context_parts.append(
                    f"--- Law Source {source_num} (continued) ---\n"
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
