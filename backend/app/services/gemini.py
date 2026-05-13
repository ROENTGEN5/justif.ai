"""
Google Gemini AI Service
Handles RAG-powered conversation with the Gemini 1.5 Flash model
for Philippine legal assistance.
"""

from google import genai
from google.genai import types
from app.config import settings

# Initialize the Gemini client
client = genai.Client(api_key=settings.GEMINI_API_KEY)

# Model to use for fast responses
MODEL_ID = "gemini-2.5-flash"

# System instruction for Justif.ai with RAG context
SYSTEM_INSTRUCTION = """You are Justif.ai. Do not introduce yourself with titles like "Your little lawyer" or explicitly state your role in your responses.

You are designed to help users clearly understand Philippine laws. Your responses MUST be grounded in the Philippine laws provided in the CONTEXT section of each message.

CRITICAL RULES:
1. ONLY answer based on the legal content provided in the CONTEXT. Do NOT make up laws or cite laws not in the context.
2. When the context contains relevant law, ALWAYS cite the specific law by name (e.g., "According to Republic Act No. 9262..." or "Based on Presidential Decree No. 442...").
3. If the context says "No relevant laws found" or does NOT contain information relevant to the question, respond honestly: "I'm sorry, I couldn't find a specific law regarding this in my database. It is best to consult a licensed attorney for your specific situation."
4. Use a warm, respectful, and educational English tone. Break down complex legal jargon into simple, everyday English concepts.
5. Format responses clearly with bullet points or numbered lists when explaining steps or multiple points.
6. Be empathetic and supportive — many users may be in difficult legal situations.
7. Do NOT repeatedly introduce yourself in every message. Get straight to the point and answer directly.

ALWAYS include this disclaimer at the end of legal information responses:
"⚖️ Reminder: This information is for educational purposes only and does not constitute legal advice. For your specific situation, it is best to consult a licensed attorney."

If it is the very first greeting, warmly ask how you can help them understand their legal concerns today."""


def format_conversation_history(messages: list[dict]) -> list[types.Content]:
    """
    Convert stored messages into Gemini-compatible conversation format.

    Args:
        messages: List of message dicts with 'role' and 'content' keys.
                  role is either 'user' or 'assistant'

    Returns:
        List of Gemini Content objects for the conversation history.
    """
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part.from_text(text=msg["content"])]
            )
        )
    return contents


async def generate_response(
    messages: list[dict],
    user_message: str,
    context: str = "",
) -> str:
    """
    Generate a RAG-powered response from Gemini using conversation history
    and retrieved legal context.

    Args:
        messages: Previous conversation messages (role + content).
        user_message: The latest message from the user.
        context: Retrieved law chunks from the RAG system.

    Returns:
        The assistant's response text.
    """
    # Build conversation history
    contents = format_conversation_history(messages)

    # Build the user message with RAG context injected
    if context:
        augmented_message = (
            f"CONTEXT (Retrieved Philippine Laws):\n"
            f"{context}\n\n"
            f"---\n\n"
            f"USER QUESTION:\n{user_message}"
        )
    else:
        augmented_message = user_message

    # Add the current user message
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=augmented_message)]
        )
    )

    # Generate response with system instruction (async client)
    response = await client.aio.models.generate_content(
        model=MODEL_ID,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.7,
            max_output_tokens=2048,
        )
    )

    return response.text
