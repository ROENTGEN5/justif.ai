"""
Chat Routes
Handles RAG-powered conversations with law retrieval, messaging, and history.
"""

import re
import json
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from app.middleware.auth import get_current_user, AuthenticatedUser
from app.services.supabase_client import get_user_client
from app.services.database_io import run_db
from app.services.deepseek import generate_chat_title
from app.services.document_pipeline import analyze_document, DocumentInputError, DocumentProviderError
from app.services.rag import rag_service, LAW_TYPES, RAGSearchError
from app.services.chat_pipeline import run_chat_pipeline, stream_chat_pipeline
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
    CitationReportRequest,
)

from app.services.request_replay import idempotent, active_request

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


_HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1"}


def _detect_mime_from_bytes(data: bytes) -> str | None:
    """Detect the real file type from its magic bytes (never trust client content-type)."""
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] in _HEIC_BRANDS:
        return "image/heic"
    return None


def _sanitize_filename(name: str | None) -> str:
    """Strip path components and control characters from a client-supplied filename."""
    base = re.split(r"[\\/]", name or "")[-1]
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()
    return base[:120] or "uploaded_file"


def _save_chat_turn(
    client,
    chat_id: str,
    user_content: str,
    assistant_content: str,
    extra_chat_updates: dict | None = None,
    payload: dict | None = None,
) -> str:
    """Batch-insert user and assistant messages in a single round-trip and update chat timestamp."""
    context = active_request.get()
    if context:
        result = client.rpc("complete_chat_request", {
            "p_id": context["key"], "p_lease": context["lease"], "p_chat": chat_id,
            "p_user_content": user_content, "p_payload": payload,
        }).execute().data
        return result["message_id"]
    inserted = (
        client.table("messages")
        .insert([
            {"chat_id": chat_id, "role": "user", "content": user_content},
            {"chat_id": chat_id, "role": "assistant", "content": assistant_content, "sources": (payload or {}).get("sources", [])},
        ])
        .execute()
    )
    message_id = ""
    if hasattr(inserted, "data") and inserted.data:
        assistant_rows = [row for row in inserted.data if row.get("role") == "assistant"]
        message_id = (assistant_rows[-1] if assistant_rows else inserted.data[-1]).get("id", "")

    update_payload = {"updated_at": "now()"}
    if extra_chat_updates:
        update_payload.update(extra_chat_updates)
    client.table("chats").update(update_payload).eq("id", chat_id).execute()
    return message_id


@router.post("/chat", response_model=ChatMessageResponse)
@idempotent
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
                await run_db(client.table("chats")
                .insert({
                    "user_id": user.user_id,
                    "title": new_title,
                })
                .execute)
            )
            chat_id = chat_result.data[0]["id"]
            previous_messages = []
            title = new_title
        else:
            # Verify the chat belongs to this user and fetch title in one query
            chat_check = (
                await run_db(client.table("chats")
                .select("id, user_id, title")
                .eq("id", chat_id)
                .eq("user_id", user.user_id)
                .execute)
            )

            if not chat_check.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Chat not found or access denied.",
                )
            title = chat_check.data[0].get("title") or "Bagong Usapan"

            # Fetch existing messages for context
            messages_result = (
                await run_db(client.table("messages")
                .select("role, content")
                .eq("chat_id", chat_id)
                .order("created_at", desc=True)
                .limit(12)
                .execute)
            )
            previous_messages = list(reversed(messages_result.data or []))

        result = await run_chat_pipeline(
            request.message, history=previous_messages, law_types=request.law_types)
        ai_response = result["answer"]
        sources = [LawSource(**source) for source in result["sources"]]

        # Batch-save user and assistant turns only after successful retrieval and generation.
        message_id = await run_db(_save_chat_turn, client, chat_id, request.message, ai_response, payload={"response": ai_response, "title": title, "sources": [s.model_dump() for s in sources]})

        return ChatMessageResponse(
            chat_id=chat_id,
            message_id=message_id,
            response=ai_response,
            title=title,
            sources=sources,
        )

    except RAGSearchError as e:
        logger.warning("Legal retrieval unavailable: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Legal sources are temporarily unavailable. Please try again.",
        ) from e
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing message for user={user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process message. Please try again.",
        )


@router.post("/chat/stream")
@idempotent
async def stream_chat(
    request: ChatMessageRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Stream a RAG-powered response via Server-Sent Events (SSE).
    Uses the unified chat pipeline and emits thinking stages, live token chunks, and final metadata/sources.
    """
    client = get_user_client(user.token)
    chat_id = request.chat_id

    if not chat_id:
        new_title = await generate_chat_title(request.message)
        chat_result = (
            await run_db(client.table("chats")
            .insert({
                "user_id": user.user_id,
                "title": new_title,
            })
            .execute)
        )
        chat_id = chat_result.data[0]["id"]
        previous_messages = []
        title = new_title
    else:
        chat_check = (
            await run_db(client.table("chats")
            .select("id, user_id, title")
            .eq("id", chat_id)
            .eq("user_id", user.user_id)
            .execute)
        )
        if not chat_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or access denied.",
            )
        title = chat_check.data[0].get("title") or "Bagong Usapan"
        messages_result = (
            await run_db(client.table("messages")
            .select("role, content")
            .eq("chat_id", chat_id)
            .order("created_at", desc=True)
            .limit(12)
            .execute)
        )
        previous_messages = list(reversed(messages_result.data or []))

    async def event_generator():
        try:
            full_answer = ""
            sources: list[LawSource] = []

            async for event in stream_chat_pipeline(
                request.message,
                history=previous_messages,
                law_types=request.law_types,
            ):
                event_type = event.get("type")
                if event_type in ("thinking", "token"):
                    yield f"data: {json.dumps(event)}\n\n"
                elif event_type == "result":
                    full_answer = event.get("answer") or ""
                    sources = [LawSource(**source) for source in event.get("sources", [])]

            if full_answer.strip():
                message_id = await run_db(_save_chat_turn, client, chat_id, request.message, full_answer, payload={"response": full_answer, "title": title, "sources": [s.model_dump() for s in sources]})
            else:
                message_id = ""

            yield f"data: {json.dumps({'type': 'done', 'chat_id': chat_id, 'message_id': message_id, 'title': title, 'response': full_answer, 'sources': [s.model_dump() for s in sources]})}\n\n"
        except RAGSearchError as exc:
            logger.warning("Legal retrieval unavailable in stream_chat: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'detail': 'Legal sources are temporarily unavailable. Please try again.'})}\n\n"
        except Exception as exc:
            logger.error(f"Error in stream_chat for user={user.user_id}: {exc}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'detail': 'Failed to process message. Please try again.'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/messages/{message_id}/reports", status_code=201)
async def report_citation(message_id: str, request: CitationReportRequest,
                          user: AuthenticatedUser = Depends(get_current_user)):
    _validate_uuid(message_id, "message_id")
    client = get_user_client(user.token)
    message = await run_db(client.table("messages").select("id,content,sources")
        .eq("id", message_id).eq("role", "assistant").execute)
    if not message.data:
        raise HTTPException(404, "Message not found or access denied")
    row = message.data[0]
    saved = await run_db(client.table("citation_reports").insert({
        "user_id": user.user_id, "message_id": message_id, "reason": request.reason.strip(),
        "message_content": row["content"], "sources": row.get("sources") or [],
    }).execute)
    if not saved.data:
        raise HTTPException(500, "Report could not be saved")
    return {"id": saved.data[0]["id"]}


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
        res = await run_db(client.table("messages").update({
            "rating": request.rating
        }).eq("id", message_id).execute)

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
            await run_db(client.table("chats")
            .select("id, title, created_at, updated_at")
            .eq("user_id", user.user_id)
            .order("updated_at", desc=True)
            .execute)
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
            await run_db(client.table("chats")
            .insert({
                "user_id": user.user_id,
                "title": request.title or "Bagong Usapan",
            })
            .execute)
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
            await run_db(client.table("chats")
            .select("id")
            .eq("id", chat_id)
            .eq("user_id", user.user_id)
            .execute)
        )

        if not chat_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or access denied.",
            )

        # Fetch messages
        result = (
            await run_db(client.table("messages")
            .select("id, role, content, created_at, rating, sources")
            .eq("chat_id", chat_id)
            .order("created_at", desc=False)
            .execute)
        )

        messages = [
            MessageItem(
                id=msg["id"],
                role=msg["role"],
                content=msg["content"],
                created_at=msg["created_at"],
                rating=msg.get("rating"),
                sources=msg.get("sources") or [],
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


@router.delete("/account")
async def delete_user_account(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Permanently delete the authenticated user's account and all associated data.
    Complies with RA 10173 (Data Privacy Act of 2012) right to erasure.
    """
    try:
        client = get_user_client(user.token)

        # 1. Purge all user chat sessions (messages cascade automatically)
        await run_db(client.table("chats").delete().eq("user_id", user.user_id).execute)

        # 2. Delete user profile record
        await run_db(client.table("profiles").delete().eq("id", user.user_id).execute)

        # 3. Delete user's avatar from storage if exists
        try:
            files = await run_db(client.storage.from_("avatars").list, prefix=user.user_id)
            if files:
                file_names = [f["name"] for f in files]
                await run_db(client.storage.from_("avatars").remove, file_names)
        except Exception as storage_err:
            logger.warning(f"Could not purge storage avatar for user {user.user_id}: {storage_err}")

        # 4. If Supabase admin RPC or admin delete is available, delete auth user
        try:
            await run_db(client.rpc("delete_user").execute)
        except Exception:
            pass

        logger.info(f"User account {user.user_id} and all personal data permanently purged.")
        return {"detail": "Account and associated personal data successfully deleted."}

    except Exception as e:
        logger.error(f"Failed to delete account for user={user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again.",
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
            await run_db(client.table("chats")
            .select("id")
            .eq("id", chat_id)
            .eq("user_id", user.user_id)
            .execute)
        )

        if not chat_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or access denied.",
            )

        # Delete the chat (messages cascade automatically)
        await run_db(client.table("chats").delete().eq("id", chat_id).execute)

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
        await run_db(client.table("chats").delete().eq("user_id", user.user_id).execute)

        return {"detail": "All chats deleted successfully."}

    except Exception as e:
        logger.error(f"Failed to delete all chats for user={user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete conversations. Please try again.",
        )


@router.post("/chat/analyze-file", response_model=FileAnalysisResponse)
@idempotent
async def analyze_uploaded_file(
    request_id: str | None = Form(None),
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
    file_bytes = await file.read(MAX_FILE_SIZE_BYTES + 1)
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

    # ── Verify real file type via magic bytes (blocks MIME spoofing) ──
    detected_type = _detect_mime_from_bytes(file_bytes)
    if detected_type is None or detected_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match a supported image or PDF format.",
        )
    if detected_type != content_type:
        logger.info(
            f"Upload content-type mismatch: claimed={content_type} detected={detected_type}; using detected."
        )
    content_type = detected_type

    filename = _sanitize_filename(file.filename)

    # ── Validate chat_id if provided ─────────────────────────
    if chat_id:
        _validate_uuid(chat_id, "chat_id")

    client = get_user_client(user.token)

    try:
        # ── Create or verify chat session ─────────────────────
        is_new_chat = False
        if not chat_id:
            title = "📎 Analyzing Document..."
            chat_result = (
                await run_db(client.table("chats")
                .insert({
                    "user_id": user.user_id,
                    "title": title,
                })
                .execute)
            )
            chat_id = chat_result.data[0]["id"]
            previous_messages = []
            is_new_chat = True
        else:
            # Verify chat belongs to this user and fetch title in one query
            chat_check = (
                await run_db(client.table("chats")
                .select("id, user_id, title")
                .eq("id", chat_id)
                .eq("user_id", user.user_id)
                .execute)
            )
            if not chat_check.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Chat not found or access denied.",
                )
            title = chat_check.data[0].get("title") or f"📎 {filename}"

            # Fetch existing messages for context
            messages_result = (
                await run_db(client.table("messages")
                .select("role, content")
                .eq("chat_id", chat_id)
                .order("created_at", desc=True)
                .limit(12)
                .execute)
            )
            previous_messages = list(reversed(messages_result.data or []))

        # ── Prepare the user's file upload message ────────────
        user_content = f"📎 Uploaded: {filename}"
        if user_prompt:
            user_content += f"\n\n{user_prompt}"

        # ── Analyze file with DeepSeek ─────────────────────────
        logger.info(
            f"Analyzing file '{filename}' ({content_type}, {len(file_bytes)} bytes) "
            f"for user={user.user_id}"
        )

        analysis = await analyze_document(
            file_bytes=file_bytes,
            mime_type=content_type,
            filename=filename,
            messages=previous_messages,
            user_prompt=user_prompt or "",
        )

        ai_response = analysis["answer"]

        # ── Batch-store user + assistant turns and update chat ─
        extra_updates: dict[str, str] = {}
        if is_new_chat:
            if user_prompt:
                new_title = await generate_chat_title(user_prompt)
            else:
                new_title = await generate_chat_title(ai_response[:300])
            title = f"📎 {new_title}"
            extra_updates["title"] = title

        message_id = await run_db(_save_chat_turn, client, chat_id, user_content, ai_response, extra_updates, payload={"response": ai_response, "title": title, "sources": analysis["sources"], "is_legal_document": analysis["is_legal_document"], "reading_warnings": analysis["reading_warnings"], "page_count": analysis["page_count"]})

        return FileAnalysisResponse(
            chat_id=chat_id,
            message_id=message_id,
            response=ai_response,
            title=title,
            sources=[LawSource(**source) for source in analysis["sources"]],
            is_legal_document=analysis["is_legal_document"],
            reading_warnings=analysis["reading_warnings"],
            page_count=analysis["page_count"],
        )

    except DocumentInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DocumentProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
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
