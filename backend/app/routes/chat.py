"""
Chat Routes
Handles RAG-powered conversations with law retrieval, messaging, and history.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.middleware.auth import get_current_user, AuthenticatedUser
from app.services.supabase_client import get_user_client
from app.services.gemini import generate_response
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
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Chat"])


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
            chat_result = (
                client.table("chats")
                .insert({
                    "user_id": user.user_id,
                    "title": request.message[:50] + ("..." if len(request.message) > 50 else ""),
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

        # ─── RAG: Retrieve relevant law chunks ──────────────
        sources = []
        context = ""

        if rag_service.is_ready:
            # Search with optional law type filter
            search_results = rag_service.search(
                query=request.message,
                top_k=5,
                law_types=request.law_types,
            )

            # Format context for the prompt
            context = rag_service.format_context(search_results)

            # Extract unique source citations
            raw_sources = rag_service.get_sources(search_results)
            sources = [LawSource(**s) for s in raw_sources]

            logger.info(
                f"RAG retrieved {len(search_results)} chunks, "
                f"{len(sources)} unique sources for query: {request.message[:80]}"
            )
        else:
            logger.warning("RAG service not ready. Generating response without legal context.")

        # Store the user's message
        client.table("messages").insert({
            "chat_id": chat_id,
            "role": "user",
            "content": request.message,
        }).execute()

        # Generate AI response using Gemini with RAG context
        ai_response = await generate_response(
            messages=previous_messages,
            user_message=request.message,
            context=context,
        )

        # Store the AI response
        client.table("messages").insert({
            "chat_id": chat_id,
            "role": "assistant",
            "content": ai_response,
        }).execute()

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
            response=ai_response,
            title=title,
            sources=sources,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process message: {str(e)}",
        )


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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch chats: {str(e)}",
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create chat: {str(e)}",
        )


@router.get("/chats/{chat_id}/messages", response_model=ChatMessagesResponse)
async def get_chat_messages(
    chat_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get all messages for a specific chat, ordered chronologically."""
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch messages: {str(e)}",
        )


@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a chat and all its messages."""
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete chat: {str(e)}",
        )
