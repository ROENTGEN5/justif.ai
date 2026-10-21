"""
Legacy alias module for deepseek service.
Provides backwards compatibility for any imports targeting app.services.gemini.
"""

from app.services.deepseek import (  # noqa: F401
    generate_response,
    analyze_file_content,
    transform_query_for_rag,
    generate_chat_title,
    format_conversation_history,
    MODEL_ID,
    SYSTEM_INSTRUCTION,
    CONVERSATIONAL_INSTRUCTION,
    FILE_ANALYSIS_INSTRUCTION,
    QUERY_TRANSFORM_INSTRUCTION,
)
