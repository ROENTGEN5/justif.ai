"""
Chat Routes
Handles RAG-powered conversations with law retrieval, messaging, and history.
"""

import re
import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from app.middleware.auth import get_current_user, AuthenticatedUser
from app.services.supabase_client import get_user_client
from app.services.deepseek import generate_response, analyze_file_content, transform_query_for_rag, generate_chat_title
from app.services.rag import rag_service, LAW_TYPES
from app.models.schemas import (
    ChatMessageRequest,
    ChatMessageResponse,
    CreateChatRequest,
    ChatListItem,
    ChatListResponse,
    MessageItem,
    ChatMessagesResponse,
    LawSource,
    RAGStatusResponse,
    FileAnalysisResponse,
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE_BYTES,
    MAX_FILE_SIZE_MB,
    RateMessageRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Chat"])

# UUID validation pattern
_UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _validate_uuid(value: str, field_name: str = "ID") -> str:
    """Validate that a string is a proper UUID. Raises 400 if not."""
    if not _UUID_PATTERN.match(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name} format.",
        )
    return value


@router.post("/chat", response_model=ChatMessageResponse)
async def send_message(
    request: ChatMessageRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Send a message to the AI assistant.
    Retrieves relevant Philippine law chunks via RAG, then generates a response.
    """
    client = get_user_client(user.token)
    chat_id = request.chat_id

    try:
        # If no chat_id, create a new chat session
        if not chat_id:
            new_title = await generate_chat_title(request.message)
            chat_result = (
                client.table("chats")
                .insert({
                    "user_id": user.user_id,
                    "title": new_title,
                })
                .execute()
            )
            chat_id = chat_result.data[0]["id"]
            previous_messages = []
        else:
            # Verify the chat belongs to this user
            chat_check = (
                client.table("chats")
                .select("id, user_id")
                .eq("id", chat_id)
                .eq("user_id", user.user_id)
                .execute()
            )

            if not chat_check.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Chat not found or access denied.",
                )

            # Fetch existing messages for context
            messages_result = (
                client.table("messages")
                .select("role, content")
                .eq("chat_id", chat_id)
                .order("created_at", desc=False)
                .execute()
            )
            previous_messages = messages_result.data or []

        # ─── Detect conversational follow-ups ───────────────
        FOLLOWUP_PHRASES = [
            "summarize", "summarise", "summary",
            "explain more", "elaborate", "can you explain",
            "what does that mean", "what do you mean",
            "simplify", "in simple terms", "give me an example",
            "what should i do", "what can i do",
            "tell me more", "more detail", "more information",
            "can you clarify", "clarify that",
        ]
        msg_lower = request.message.lower().strip()
        is_followup = any(phrase in msg_lower for phrase in FOLLOWUP_PHRASES)

        # ─── RAG: Retrieve relevant law chunks ──────────────
        sources = []
        context = ""

        if rag_service.is_ready and not is_followup:
            # Transform the raw user query into dense legal search keywords
            # to maximise Pinecone retrieval precision before searching
            search_query = await transform_query_for_rag(request.message)

            # Search with optional law type filter
            search_results = rag_service.search(
                query=search_query,
                top_k=5,
                law_types=request.law_types,
            )

            # Extract unique source citations FIRST (deduplicate by title)
            raw_sources = rag_service.get_sources(search_results)
            sources = [LawSource(**s) for s in raw_sources]

            # Format context using only deduplicated sources so the AI
            # sees the same numbered sources the user will see
            context = rag_service.format_context_from_sources(search_results, raw_sources)

            logger.info(
                f"RAG retrieved {len(search_results)} chunks, "
                f"{len(sources)} unique sources for user={user.user_id}"
            )
        elif is_followup:
            logger.info(f"Conversational follow-up detected — skipping RAG for user={user.user_id}")
        else:
            logger.warning("RAG service not ready. Generating response without legal context.")

        # Store the user's message
        client.table("messages").insert({
            "chat_id": chat_id,
            "role": "user",
            "content": request.message,
        }).execute()

        # Generate AI response using RAG context (or LLM knowledge if RAG context is empty)
        is_initial = len(previous_messages) == 0
        ai_response = await generate_response(
            messages=previous_messages,
            user_message=request.message,
            context=context,
            is_initial_query=is_initial,
        )

        # Store the AI response
        ai_res = client.table("messages").insert({
            "chat_id": chat_id,
            "role": "assistant",
            "content": ai_response,
        }).execute()
        message_id = ai_res.data[0]["id"] if hasattr(ai_res, "data") and ai_res.data else ""

        # Update the chat's updated_at timestamp
        client.table("chats").update({
            "updated_at": "now()",
        }).eq("id", chat_id).execute()

        # Get the chat title
        chat_data = (
            client.table("chats")
            .select("title")
            .eq("id", chat_id)
            .execute()
        )
        title = chat_data.data[0]["title"] if chat_data.data else "Bagong Usapan"

        return ChatMessageResponse(
            chat_id=chat_id,
            message_id=message_id,
            response=ai_response,
            title=title,
            sources=sources,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing message for user={user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process message. Please try again.",
        )


@router.patch("/messages/{message_id}/rate")
async def rate_message(
    message_id: str,
    request: RateMessageRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Rate an assistant's message."""
    client = get_user_client(user.token)
    try:
        # The database policy ensures they can only update messages in their own chats
        res = client.table("messages").update({
            "rating": request.rating
        }).eq("id", message_id).execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Message not found or access denied")
        
        return {"status": "success", "message": "Rating updated."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rating message {message_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to rate message.")


@router.get("/rag/status", response_model=RAGStatusResponse)
async def rag_status():
    """Get the status of the RAG system."""
    return RAGStatusResponse(
        is_ready=rag_service.is_ready,
        total_chunks=len(rag_service.chunks) if rag_service.chunks else 0,
        law_types=LAW_TYPES,
    )


@router.get("/rag/law-types", response_model=list[str])
async def get_law_types():
    """Get all available law type categories for filtering."""
    return LAW_TYPES


@router.get("/chats", response_model=ChatListResponse)
async def list_chats(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get all chats for the authenticated user, sorted by most recent."""
    try:
        client = get_user_client(user.token)
        result = (
            client.table("chats")
            .select("id, title, created_at, updated_at")
            .eq("user_id", user.user_id)
            .order("updated_at", desc=True)
            .execute()
        )

        chats = [
            ChatListItem(
                id=chat["id"],
                title=chat["title"],
                created_at=chat["created_at"],
                updated_at=chat["updated_at"],
            )
            for chat in (result.data or [])
        ]

        return ChatListResponse(chats=chats)

    except Exception as e:
        logger.error(f"Failed to fetch chats for user={user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch conversations. Please try again.",
        )


@router.post("/chats", response_model=ChatListItem)
async def create_chat(
    request: CreateChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a new empty chat session."""
    try:
        client = get_user_client(user.token)
        result = (
            client.table("chats")
            .insert({
                "user_id": user.user_id,
                "title": request.title or "Bagong Usapan",
            })
            .execute()
        )

        chat = result.data[0]
        return ChatListItem(
            id=chat["id"],
            title=chat["title"],
            created_at=chat["created_at"],
            updated_at=chat["updated_at"],
        )

    except Exception as e:
        logger.error(f"Failed to create chat for user={user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create conversation. Please try again.",
        )


@router.get("/chats/{chat_id}/messages", response_model=ChatMessagesResponse)
async def get_chat_messages(
    chat_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get all messages for a specific chat, ordered chronologically."""
    _validate_uuid(chat_id, "chat_id")

    try:
        client = get_user_client(user.token)
        # Verify chat belongs to user
        chat_check = (
            client.table("chats")
            .select("id")
            .eq("id", chat_id)
            .eq("user_id", user.user_id)
            .execute()
        )

        if not chat_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or access denied.",
            )

        # Fetch messages
        result = (
            client.table("messages")
            .select("id, role, content, created_at")
            .eq("chat_id", chat_id)
            .order("created_at", desc=False)
            .execute()
        )

        messages = [
            MessageItem(
                id=msg["id"],
                role=msg["role"],
                content=msg["content"],
                created_at=msg["created_at"],
            )
            for msg in (result.data or [])
        ]

        return ChatMessagesResponse(messages=messages)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch messages for chat={chat_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch messages. Please try again.",
        )


@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a chat and all its messages."""
    _validate_uuid(chat_id, "chat_id")

    try:
        client = get_user_client(user.token)
        # Verify chat belongs to user
        chat_check = (
            client.table("chats")
            .select("id")
            .eq("id", chat_id)
            .eq("user_id", user.user_id)
            .execute()
        )

        if not chat_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or access denied.",
            )

        # Delete the chat (messages cascade automatically)
        client.table("chats").delete().eq("id", chat_id).execute()

        return {"detail": "Chat deleted successfully."}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete chat={chat_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete conversation. Please try again.",
        )


@router.delete("/chats")
async def delete_all_chats(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete all chats for the authenticated user."""
    try:
        client = get_user_client(user.token)
        # Delete all chats for this user (messages cascade)
        # The RLS policy also enforces the user_id
        client.table("chats").delete().eq("user_id", user.user_id).execute()

        return {"detail": "All chats deleted successfully."}

    except Exception as e:
        logger.error(f"Failed to delete all chats for user={user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete conversations. Please try again.",
        )


@router.post("/chat/analyze-file", response_model=FileAnalysisResponse)
async def analyze_uploaded_file(
    file: UploadFile = File(..., description="Image or PDF file to analyze"),
    chat_id: str | None = Form(None, description="Existing chat ID (UUID)"),
    user_prompt: str | None = Form(None, description="Optional additional question about the file"),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Analyze an uploaded file (image or PDF) for legal content.
    Extracts text, identifies legal jargon, and explains it in plain English.
    """
    # ── Validate file type ────────────────────────────────────
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {content_type}. "
                   f"Allowed types: images (JPEG, PNG, WebP, HEIC) and PDF.",
        )

    # ── Read and validate file size ───────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB.",
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    filename = file.filename or "uploaded_file"

    # ── Validate chat_id if provided ─────────────────────────
    if chat_id:
        _validate_uuid(chat_id, "chat_id")

    client = get_user_client(user.token)

    try:
        # ── Create or verify chat session ─────────────────────
        is_new_chat = False
        if not chat_id:
            chat_result = (
                client.table("chats")
                .insert({
                    "user_id": user.user_id,
                    "title": "📎 Analyzing Document...",
                })
                .execute()
            )
            chat_id = chat_result.data[0]["id"]
            previous_messages = []
            is_new_chat = True
        else:
            # Verify chat belongs to this user
            chat_check = (
                client.table("chats")
                .select("id, user_id")
                .eq("id", chat_id)
                .eq("user_id", user.user_id)
                .execute()
            )
            if not chat_check.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Chat not found or access denied.",
                )

            # Fetch existing messages for context
            messages_result = (
                client.table("messages")
                .select("role, content")
                .eq("chat_id", chat_id)
                .order("created_at", desc=False)
                .execute()
            )
            previous_messages = messages_result.data or []

        # ── Store the user's file upload message ─────────────
        user_content = f"📎 Uploaded: {filename}"
        if user_prompt:
            user_content += f"\n\n{user_prompt}"

        client.table("messages").insert({
            "chat_id": chat_id,
            "role": "user",
            "content": user_content,
        }).execute()

        # ── Analyze file with DeepSeek ─────────────────────────
        logger.info(
            f"Analyzing file '{filename}' ({content_type}, {len(file_bytes)} bytes) "
            f"for user={user.user_id}"
        )

        ai_response = await analyze_file_content(
            file_bytes=file_bytes,
            mime_type=content_type,
            filename=filename,
            messages=previous_messages,
            user_prompt=user_prompt or "",
        )

        # ── Determine if legal document from response ────────
        is_legal = not any(
            phrase in ai_response.lower()
            for phrase in [
                "does not appear to be a legal document",
                "not a legal document",
                "this is not a legal",
                "foreign legal document",
                "outside philippine jurisdiction",
            ]
        )

        # ── Store the AI response ────────────────────────────
        ai_res = client.table("messages").insert({
            "chat_id": chat_id,
            "role": "assistant",
            "content": ai_response,
        }).execute()
        message_id = ai_res.data[0]["id"] if hasattr(ai_res, "data") and ai_res.data else ""

        # Update the chat's updated_at timestamp (and title if new chat)
        update_data = {"updated_at": "now()"}
        if is_new_chat:
            if user_prompt:
                new_title = await generate_chat_title(user_prompt)
            else:
                new_title = await generate_chat_title(ai_response[:300])
            update_data["title"] = f"📎 {new_title}"

        client.table("chats").update(update_data).eq("id", chat_id).execute()

        # Get the chat title
        chat_data = (
            client.table("chats")
            .select("title")
            .eq("id", chat_id)
            .execute()
        )
        title = chat_data.data[0]["title"] if chat_data.data else f"📎 {filename}"

        return FileAnalysisResponse(
            chat_id=chat_id,
            message_id=message_id,
            response=ai_response,
            title=title,
            sources=[],
            is_legal_document=is_legal,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error analyzing file for user={user.user_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to analyze file. Please try again.",
        )
