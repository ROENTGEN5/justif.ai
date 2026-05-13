"""
Pydantic Models / Schemas
Request and response models for the Justif.ai RAG API.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ─── Law Source ──────────────────────────────────────────────

class LawSource(BaseModel):
    """A cited law source from the RAG system."""
    short_title: str = Field("", description="Short title of the law (e.g., 'Republic Act No. 9262')")
    full_title: str = Field("", description="Full title of the law")
    law_type: str = Field("", description="Type of law (e.g., 'republic_act')")
    date: str = Field("", description="Date of enactment or issuance")
    url: str = Field("", description="URL to the law on the E-Library")
    label: str = Field("", description="Category label (e.g., 'Republic Acts')")


# ─── Chat Endpoints ──────────────────────────────────────────

class ChatMessageRequest(BaseModel):
    """Request body for sending a chat message."""
    chat_id: Optional[str] = Field(
        None,
        description="Existing chat ID. If None, a new chat is created."
    )
    message: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="The user's message text."
    )
    law_types: Optional[list[str]] = Field(
        None,
        description="Optional filter: list of law type labels to search within. "
                    "If None, searches all law types."
    )


class ChatMessageResponse(BaseModel):
    """Response body after processing a chat message."""
    chat_id: str = Field(..., description="The chat session ID.")
    response: str = Field(..., description="The AI assistant's response.")
    title: str = Field(..., description="The chat title.")
    sources: list[LawSource] = Field(
        default_factory=list,
        description="Law sources cited in the response."
    )


class CreateChatRequest(BaseModel):
    """Request body for creating a new chat session."""
    title: Optional[str] = Field(
        "Bagong Usapan",
        description="Title for the new chat."
    )


class ChatListItem(BaseModel):
    """A single chat in the list of user's chats."""
    id: str
    title: str
    created_at: str
    updated_at: str


class ChatListResponse(BaseModel):
    """Response body for listing user's chats."""
    chats: list[ChatListItem]


class MessageItem(BaseModel):
    """A single message in a chat."""
    id: str
    role: str
    content: str
    created_at: str


class ChatMessagesResponse(BaseModel):
    """Response body for getting messages of a chat."""
    messages: list[MessageItem]


# ─── RAG Info ────────────────────────────────────────────────

class LawTypeInfo(BaseModel):
    """Information about a law type category."""
    label: str
    count: int = 0


class RAGStatusResponse(BaseModel):
    """Response body for RAG system status."""
    is_ready: bool
    total_chunks: int = 0
    law_types: list[str] = []


# ─── Health Check ────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    service: str = "Justif.ai API"
    version: str = "1.0.0"
    rag_ready: bool = False
