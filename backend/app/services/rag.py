"""
Justif.ai — RAG (Retrieval-Augmented Generation) Service
Handles CSV loading, text chunking, Nomic Cloud / Ollama embedding, and Pinecone vector search
over 13,953 Philippine laws.

Vector DB: Pinecone (serverless)
Embeddings: Nomic Cloud API (nomic-embed-text-v1.5) or Ollama nomic-embed-text (768-dim)
"""

import csv
from collections import OrderedDict
from functools import lru_cache
import json
import logging
import re
import hashlib
from pathlib import Path
from typing import Optional

import httpx
import ollama
from pinecone import Pinecone
from app.config import settings
from app.services.corpus_identity import chunk_id
from app.services.relevance import lexical_scores
from app.services.law_lookup import named_laws, law_filter
from app.services.response_planning import requested_sections
from app.services.section_evidence import headings, join_overlap, section_excerpt

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


class RAGSearchError(RuntimeError):
    """Retrieval could not execute; distinct from a successful empty search."""


def source_key(source: dict) -> str:
    """Keep distinct legal documents separate even when their titles coincide."""
    url = source.get("url", "").strip()
    if url:
        return "url:" + url
    title = source.get("full_title") or source.get("short_title", "")
    return "title:" + " ".join(title.casefold().split()) + "|" + source.get("date", "") if title else ""


def _content_text(text: str) -> str:
    # Indexed chunks start with a metadata header. Compare the legal body so
    # mirrored publications with different labels do not occupy multiple slots.
    return re.sub(r"^(?:\[[^\]\n]*\]\s*)+\n?", "", text).strip()


def _normalized_content(text: str) -> str:
    return " ".join(_content_text(text).casefold().split())


def _navigation_penalty(text: str) -> float:
    """Demote dense contents lists, without excluding substantive numbered rules."""
    body = _content_text(text)
    headings = list(re.finditer(r"\b\d{1,3}\.\s+[A-Z]", body))
    if len(headings) < 6:
        return 0.0
    intervals = [b.start() - a.start() for a, b in zip(headings, headings[1:])]
    short_intervals = sum(length < 80 for length in intervals)
    return 0.12 if short_intervals / len(intervals) >= 0.8 else 0.0


def select_evidence(results: list[SearchResult], top_k: int, query: str = "") -> list[SearchResult]:
    """Select distinct evidence from an expanded semantic candidate set.

    The original vector scores are retained for diagnostics. Only normalized
    identical bodies are removed: a one-word change can reverse a legal rule,
    so fuzzy similarity must not discard differently worded provisions.
    """
    # Lexical evidence supplements semantic similarity for explicit concepts,
    # names and article numbers. Its bounded contribution preserves semantic
    # matches for translated questions and paraphrases with little word overlap.
    lexical = lexical_scores(query, [_content_text(r.chunk.text) for r in results])
    maximum = max(lexical, default=0) or 1
    ranked = [result for _, result in sorted(
        enumerate(results),
        key=lambda pair: pair[1].score + .08 * lexical[pair[0]] / maximum - _navigation_penalty(pair[1].chunk.text),
        reverse=True)]
    selected, fingerprints = [], set()
    for result in ranked:
        fingerprint = _normalized_content(result.chunk.text)
        if not fingerprint or not source_key(result.chunk.to_dict()):
            continue
        if fingerprint in fingerprints:
            continue
        selected.append(result)
        fingerprints.add(fingerprint)
        if len(selected) == top_k:
            break
    return selected


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

# Persistent HTTP client pool for Nomic Cloud API (avoids repeated TCP/TLS handshakes)
_nomic_http_client: Optional[httpx.Client] = None


def _get_nomic_http_client() -> httpx.Client:
    """Return a shared persistent HTTP client for Nomic Cloud API requests."""
    global _nomic_http_client
    if _nomic_http_client is None or _nomic_http_client.is_closed:
        _nomic_http_client = httpx.Client(
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
    return _nomic_http_client


def close_nomic_http_client() -> None:
    """Close the shared Nomic HTTP client pool when shutting down."""
    global _nomic_http_client
    if _nomic_http_client is not None and not _nomic_http_client.is_closed:
        _nomic_http_client.close()
        _nomic_http_client = None


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
    client = _get_nomic_http_client()
    resp = client.post(NOMIC_EMBED_URL, headers=headers, json=payload)
    resp.raise_for_status()
    data = resp.json()
    return data["embeddings"]


@lru_cache(maxsize=512)
def _cached_embed_query(text: str, nomic_api_key: str) -> tuple[float, ...]:
    """Internal LRU-cached query embedding helper returning an immutable tuple."""
    if nomic_api_key:
        try:
            embeddings = _embed_via_nomic_api([text], task_type="search_query")
            return tuple(embeddings[0])
        except Exception as e:
            logger.warning(f"Nomic Cloud API embedding failed, falling back to Ollama: {e}")

    response = _ollama_client.embed(
        model=EMBEDDING_MODEL,
        input=f"search_query: {text}",
    )
    return tuple(response["embeddings"][0])


def embed_query(text: str) -> list[float]:
    """
    Embed a single query string into a 768-dim vector.
    Uses Nomic Cloud API when NOMIC_API_KEY is set (for cloud deployments like Render),
    and falls back to local Ollama nomic-embed-text.
    """
    key = settings.NOMIC_API_KEY if settings.EMBEDDING_PROVIDER != "local" else ""
    return list(_cached_embed_query(text, key or ""))


embed_query.cache_clear = _cached_embed_query.cache_clear  # type: ignore[attr-defined]
embed_query.cache_info = _cached_embed_query.cache_info    # type: ignore[attr-defined]


def embed_documents(texts: list[str]) -> list[list[float]]:
    """
    Embed a batch of document texts into 768-dim vectors.
    Uses Nomic Cloud API when NOMIC_API_KEY is set, otherwise local Ollama.
    """
    if settings.NOMIC_API_KEY and settings.EMBEDDING_PROVIDER != "local":
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
        self._section_cache: OrderedDict[tuple, tuple[SearchResult, ...]] = OrderedDict()

    def clear_cache(self) -> None:
        """Clear the canonical law-section lookup cache."""
        self._section_cache.clear()

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
            if settings.NOMIC_API_KEY and settings.EMBEDDING_PROVIDER != "local":
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

    def _requested_sections(self, candidates, targets, top_k):
        """Use existing metadata/IDs to join up to five consecutive chunks.

        There is no index mutation. Fetch identity is checked against URL and
        title because legacy IDs do not include URL and can collide.
        """
        windows, seen = [], set()
        for target in targets:
            anchors = [r for r in candidates if any((kind, number) == target
                       for _, _, kind, number in headings(_content_text(r.chunk.text)))]
            for anchor in sorted(anchors, key=lambda r: r.score, reverse=True):
                chunk = anchor.chunk
                key = (chunk.url, target)
                if not chunk.url or key in seen:
                    continue
                seen.add(key)
                start = int(chunk.chunk_index)
                total = int(chunk.total_chunks)
                by_index = {int(r.chunk.chunk_index): r.chunk for r in candidates
                            if r.chunk.url == chunk.url and r.chunk.short_title == chunk.short_title
                            and r.chunk.label == chunk.label}
                last_allowed = min(start + 4, total - 1)
                body, end_index = _content_text(chunk.text), start
                excerpt = section_excerpt(body, target, at_document_end=start == total - 1)
                if excerpt and not excerpt[1]:
                    missing = [i for i in range(start + 1, last_allowed + 1) if i not in by_index]
                    if missing:
                        ids = {hashlib.md5(f"{chunk.short_title}|{chunk.label}|{i}".encode(), usedforsecurity=False).hexdigest(): i for i in missing}
                        ids.update({chunk_id(chunk.url, i): i for i in missing})
                        try:
                            fetched = self.index.fetch(ids=list(ids))
                            for vector_id, vector in fetched.vectors.items():
                                meta = vector.metadata or {}
                                expected = ids.get(vector_id)
                                if (meta.get("url") != chunk.url or meta.get("short_title") != chunk.short_title
                                        or meta.get("label") != chunk.label or meta.get("chunk_index") != expected):
                                    continue
                                by_index[expected] = ChunkMetadata(chunk.short_title, chunk.full_title,
                                    chunk.law_type, chunk.date, chunk.url, chunk.label, expected, total, meta.get("text", ""))
                        except Exception as exc:
                            # Existing retrieval remains usable, explicitly marked
                            # incomplete; a best-effort neighbor fetch isn't an outage.
                            logger.warning("Section continuation unavailable (%s)", type(exc).__name__)
                    for position in range(start + 1, last_allowed + 1):
                        if position not in by_index:
                            break  # Never bridge a missing chunk as continuous text.
                        body = join_overlap(body, _content_text(by_index[position].text))
                        end_index = position
                        excerpt = section_excerpt(body, target, at_document_end=position == total - 1)
                        if excerpt and excerpt[1]:
                            break
                if not excerpt:
                    continue
                merged = SearchResult(ChunkMetadata(chunk.short_title, chunk.full_title, chunk.law_type,
                    chunk.date, chunk.url, chunk.label, start, total, excerpt[0]), anchor.score)
                merged.evidence_span = {"kind": target[0], "number": target[1], "start_chunk": start,
                                        "end_chunk": end_index, "complete": excerpt[1]}
                windows.append(merged)
                if len(windows) == top_k:
                    return windows
        return windows

    def search(
        self,
        query: str,
        top_k: int = 5,
        law_types: Optional[list[str]] = None,
        strict: bool = False,
        law_query: Optional[str] = None,
    ) -> list[SearchResult]:
        """
        Search for the most relevant law chunks for a given query.

        Args:
            query: The user's legal question.
            top_k: Number of results to return.
            law_types: Optional filter — only return chunks from these law categories.
            strict: Raise RAGSearchError on service failure instead of returning [].
            law_query: Original user question; prevents a rewritten law number
                from determining the exact-law filter.

        Returns:
            List of SearchResult objects, sorted by relevance.
        """
        if not 1 <= top_k <= 100:
            raise ValueError("top_k must be between 1 and 100")
        if not self.is_ready:
            if strict:
                raise RAGSearchError("Legal retrieval service is unavailable")
            logger.warning("RAG service not initialized. Returning empty results.")
            return []

        try:
            references = named_laws(query if law_query is None else law_query)
            sections = requested_sections(query if law_query is None else law_query)
            cache_key = None
            if references and sections:
                cache_key = (
                    tuple((r["family"], r["number"], r["implementing_rules"]) for r in references),
                    tuple(sections),
                    tuple(law_types or ()),
                    top_k,
                    query.strip().lower(),
                )
                if cache_key in self._section_cache:
                    self._section_cache.move_to_end(cache_key)
                    return list(self._section_cache[cache_key])

            # Embed the query using Nomic Cloud API or Ollama
            query_embedding = embed_query(query)

            # Exact metadata matching avoids substituting a semantically similar
            # law when the user explicitly names one. No unfiltered fallback.
            filters = ([law_filter(ref, law_types) for ref in references] if references else
                       [{"label": {"$in": law_types}} if law_types else None])
            matches = []
            for pinecone_filter in filters:
                query_response = self.index.query(
                    vector=query_embedding,
                    top_k=100 if references and sections else min(100, max(40, top_k * 8)),
                    include_metadata=True,
                    filter=pinecone_filter,
                )
                matches.append(query_response.matches)

            # Convert Pinecone results to SearchResult objects
            groups = []
            for group in matches:
                results = []
                for match in group:
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
                windows = self._requested_sections(results, sections, top_k) if references and sections else []
                recovered = {(r.evidence_span["kind"], r.evidence_span["number"]) for r in windows}
                if windows and all(s in recovered for s in sections):
                    # Supply the focused section(s), not five unrelated snippets.
                    groups.append(windows)
                else:
                    groups.append(windows + select_evidence(results, max(1, top_k - len(windows)), query=query))
            # Give each explicitly requested law a chance to contribute before
            # filling the remaining slots (useful for comparisons/amendments).
            selected = []
            for position in range(top_k):
                for group in groups:
                    if position < len(group):
                        selected.append(group[position])
                        if len(selected) == top_k:
                            break
                if len(selected) == top_k:
                    break
            if cache_key is not None and selected:
                self._section_cache[cache_key] = tuple(selected)
                if len(self._section_cache) > 128:
                    self._section_cache.popitem(last=False)
            return selected

        except Exception as e:
            logger.error(f"RAG search error: {e}", exc_info=True)
            if strict:
                raise RAGSearchError("Legal retrieval failed") from e
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

        Groups chunks by their source identity and numbers them to match
        the deduplicated sources list, so "Source 1" in the AI's context
        corresponds exactly to Source 1 in the user's SourceCard.
        """
        if not results:
            return "Walang nakitang relevant na batas sa database."

        # Map each deduplicated source to its index (1-based)
        source_index_map: dict[str, int] = {}
        for i, src in enumerate(deduplicated_sources):
            key = source_key(src)
            if key and key not in source_index_map:
                source_index_map[key] = i + 1

        # Build context grouped by source number
        context_parts = []
        seen_sources: set[int] = set()

        for result in results:
            chunk = result.chunk
            key = source_key(chunk.to_dict())
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
        Deduplicates by URL (title and date when a URL is unavailable).
        """
        seen = set()
        sources = []

        for result in results:
            key = source_key(result.chunk.to_dict())
            if key and key not in seen:
                seen.add(key)
                span = getattr(result, "evidence_span", None) or {}
                sources.append({**result.chunk.to_dict(), "citation_number": len(sources) + 1,
                    "excerpts": [], "section": str(span.get("kind", "")) + " " + str(span.get("number", "")),
                    "support_status": "retrieved_evidence", "legal_status": "not_verified"})
            if key:
                source = next((s for s in sources if source_key(s) == key), None)
                if source is not None and result.chunk.text not in source["excerpts"]:
                    source["excerpts"].append(result.chunk.text[:8000])

        return sources


# ─── Singleton Instance ─────────────────────────────────────

rag_service = RAGService()
