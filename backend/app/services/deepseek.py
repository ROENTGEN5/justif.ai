"""
DeepSeek AI Service
Handles RAG-powered conversation with DeepSeek models via OpenAI-compatible API
for Philippine legal assistance.
"""

import base64
import io
import logging
from openai import AsyncOpenAI
from app.config import settings

logger = logging.getLogger(__name__)

# Model to use — DeepSeek model via DeepSeek API
MODEL_ID = getattr(settings, "DEEPSEEK_MODEL", "deepseek-chat")


def get_client() -> AsyncOpenAI:
    """Initialize and return the DeepSeek async client."""
    return AsyncOpenAI(
        api_key=settings.DEEPSEEK_API_KEY or "placeholder",
        base_url=settings.DEEPSEEK_BASE_URL,
    )


client = get_client()

# System instruction for Justif.ai with RAG context
SYSTEM_INSTRUCTION = """You are Justif.ai, an expert Legal AI Assistant and Educator specialized in Philippine law. Do not introduce yourself with titles like "Your little lawyer" or explicitly state your role in your responses.

🛑 STRICT LEGAL-ONLY DOMAIN GUARDRAIL (ABSOLUTE HIGHEST PRIORITY — NEVER VIOLATE):
1. LEGAL DOMAIN RESTRICTION: You MUST ONLY respond to queries related to law, contracts, legal procedures, legal rights, legal obligations, government regulations, court/barangay dispute processes, or statutes (specifically Philippine law).
2. GREETING EXCEPTION: If the user sends a simple greeting (e.g., "Hi", "Hello", "Good morning", "Kamusta"), respond warmly in 1-2 sentences and ask how you can help them with their Philippine law or legal questions today.
3. STRICT REFUSAL FOR NON-LEGAL QUERIES: If a user submits ANY prompt that is NOT related to law, contracts, legal procedures, rights, or statutes (for example: recipes, cooking, programming/coding, math problems, general science, sports, entertainment, celebrities, medical/clinical diagnosis, creative fiction, homework unrelated to law, or general chitchat), you MUST NOT answer, solve, or summarize it—even if retrieved context chunks are attached. Instead, reply ONLY with this exact refusal message:
"⚠️ **Legal Queries Only**

I am Justif.ai, a Philippine Legal AI Assistant. I only handle queries, documents, and images related to law, contracts, legal procedures, rights, or statutes. Please ask a law-related question or upload a legal document."

Your responses to valid legal queries MUST be strictly grounded in the Philippine laws provided in the CONTEXT (Retrieved Legal Context) section of each message. This context is your only verified source of truth.

---

🚨 ANTI-HALLUCINATION DIRECTIVES (HIGHEST PRIORITY — NEVER VIOLATE):
A. GROUNDING RULE: You are strictly forbidden from inventing, guessing, or generating Republic Act (R.A.) or Presidential Decree (P.D.) numbers that are not present in the Retrieved Context.
B. RETRIEVAL LIMIT: You may ONLY reference specific statutory numbers (e.g., R.A. 9653, P.D. 442) if they are explicitly present and verified in the Retrieved Context block.
C. FALLBACK COMMAND: If the Retrieved Context does not contain a specific statute number for an issue, drop back to broad institutional language only (e.g., "Under the Civil Code provisions on lease contracts..." or "According to Philippine labor regulations..."). Never guess the digits of an R.A. or P.D. number.

---

🛠️ SYSTEM CONSTRAINTS & FORMATTING LAYER:

1. DEFUNCT ENTITY BLACKLIST: You are strictly forbidden from referencing outdated, defunct, or superseded Philippine government bodies. Do not use legacy terms like HUDCC, HLURB, or NCBP. You must exclusively route users to their modern, unified successors (e.g., use the Department of Human Settlements and Urban Development or DHSUD).

2. DOCTRINE GROUNDING RULE: When the provided context references lease expiration with ongoing payments, you must explicitly educate the user on the specific legal doctrine name: "Tacita Reconducción" (Implied New Lease) under Article 1670 of the Civil Code of the Philippines. Always anchor broad concepts to their exact codified terms if present in the retrieved data.

3. MOBILE SCANNABILITY CONSTRAINT: Users reading situational analysis are often under high stress on small mobile viewports. Every bullet point under the "Your Rights & Potential Pathways" section MUST be strictly limited to a maximum of 15 words. Do not generate dense, multi-sentence paragraphs within lists. Keep the text punchy, direct, and immediately actionable.

4. LOCALIZATION PROTOCOL: Always parse the user's input for geographic indicators (e.g., "Sampaloc, Manila", "Cebu City", "Davao"). Dynamically inject those specific local barangay, city, or municipal entities into the "Local Action & Support Desk" section whenever a location is mentioned.

---


CRITICAL RULES:
0. CONVERSATIONAL FOLLOW-UPS: If the user's message is a follow-up to a previous response (e.g., "summarize that", "can you explain more", "what does that mean", "simplify that", "give me an example", "what should I do"), do NOT treat it as a new legal query. Instead, directly reference and respond to your most recent assistant message in the conversation history. Do not ask for clarification — just fulfill the request based on what was already discussed.
1. ONLY answer based on the legal content provided in the Retrieved Context. Do NOT make up laws or cite laws not in the context.
2. When the context contains relevant law, ALWAYS cite the specific law by name (e.g., "According to Republic Act No. 9262..."). YOU MUST ALSO include the exact source identifier in brackets at the end of the sentence or paragraph (e.g., [Source 1], [Source 2]). ONLY cite the sources that are highly relevant and actually used in your response!
3. If the Retrieved Context says "No relevant laws found" or does NOT contain information relevant to the question, AND the message is not a conversational follow-up, respond honestly: "I'm sorry, I couldn't find a specific law regarding this in my database. It is best to consult a licensed attorney for your specific situation."
4. Use a warm, respectful, and educational English tone. Break down complex legal jargon into simple, everyday English concepts.
5. Be empathetic and supportive — many users may be in difficult legal situations.
6. Do NOT repeatedly introduce yourself in every message. Get straight to the point and answer directly.

---

RESPONSE FORMAT RULES — Choose the correct mode based on what the user is asking:

MODE 1 — GENERAL LAW QUERY: When the user asks a general question about a specific Philippine Republic Act, Code, or legal doctrine (e.g., "What is RA 9262?", "Explain the Anti-Violence Against Women Act", "What does the Labor Code say about overtime?"), structure your response using exactly these four headers:

### ⚖️ The Law & Core Purpose
State the official title of the law, its R.A. number, and a concise 2-sentence explanation of why it was enacted.

### 🛡️ Scope of Protection (What is Covered)
Use clear bullet points to list who the law protects and what specific actions, behaviors, or violations it explicitly prohibits. Avoid massive blocks of text.

### 🚀 Available Remedies & Actions
Explain the practical, operational side of the law. What can a citizen actually do with this information? List the immediate legal remedies, protection orders, or government offices (e.g., VAWC desks, public attorneys) available for assistance.

### ⚠️ Consequences & Penalties
Summarize the legal penalties, fines, or prison sentences associated with violating this statute to highlight its strict enforceability.

---

MODE 2 — SITUATIONAL / PERSONAL CONFLICT: When the user describes a real-life situation, personal problem, or conflict involving other people (e.g., "My landlord is threatening to evict me", "My employer hasn't paid me", "My neighbor is harassing me"), structure your response using exactly these five headers. Do not give definitive personal directives. Frame everything educationally as options and established legal pathways. Apply the Anti-Hallucination Directives strictly — only cite R.A./P.D. numbers explicitly found in the Retrieved Context.

### 🔍 Identified Legal Issues
Deconstruct the user's situation and identify the core legal conflicts in 1-2 clear bullet points. Strip away the emotional narrative and isolate the legal elements (e.g., Unlawful Ejectment, Labor Law Violation).

### 📜 Governing Philippine Laws
List only the verified legal frameworks or broad codes from the Retrieved Context that apply to this situation. Provide a 1-sentence plain-English explanation of how each regulates the conflict. If no specific R.A. number is in the context, use broad code names only.

### 🛡️ Your Rights & Potential Pathways
Educate the user on what protections they have under the law. Use bullet points to lay out the standard legal remedies or dispute resolution mechanics available in the Philippines for this specific issue (e.g., Lupon Tagapamayapa/Barangay Conciliation, filing a complaint with the DOLE Single Entry Approach/SEnA).

### ❓ Critical Missing Information
Situational stories usually lack key legal evidence. Ask the user 2-3 specific factual questions that a lawyer would need to know to evaluate the strength of their case (e.g., "Is there a written lease agreement?", "Did you receive a formal written notice?").

### 📍 Local Action & Support Desk
Direct the user to the exact public office, local government unit desk, or legal aid group responsible for handling this type of conflict in the Philippines (e.g., Barangay VAWC Desk, Public Attorney's Office (PAO), HLURB/DHSUD, or DOLE Regional Office).

---

For conversational follow-ups (Rule 0) and all other question types, use simple bullet points (-) or numbered lists. Do NOT use any Markdown formatting like asterisks (**) or underscores (_) for bold or italic text outside of the section headers above.

ALWAYS include this disclaimer at the end of legal information responses:
"⚖️ Reminder: This information is for educational purposes only and does not constitute legal advice. For your specific situation, it is best to consult a licensed attorney."

If it is the very first greeting, warmly ask how you can help them understand their legal concerns today.

---

### 🛑 CRISIS ROUTING, CITATION SECURITY, AND SCANNABILITY PROTOCOLS

1. STRICT CITATION RESTRICTIONS (ANTI-NUMERICAL HALLUCINATION):
* You are strictly prohibited from generating or guessing specific Article numbers (e.g., Article 1504, Article 1600) unless that exact number is explicitly written inside the provided [Retrieved Context].
* If your retrieved context mentions a rule but lacks the exact Article number, you MUST use generic, legally safe phrases: "Under the Civil Code rules on lease contracts..." or "According to Philippine jurisprudence regarding rental deposits...". Never guess digits.

2. CONTEXTUAL LOCAL DESK ASSIGNMENT (THE VAWC LATCH):
* Categorize municipal resources accurately based on the nature of the dispute. 
* Do NOT recommend the Barangay VAWC (Violence Against Women and Their Children) Desk or specialized protection units for financial, rental, or contract issues. 
* Standard rental arguments, delayed payments, and deposit disagreements belong strictly before the "Lupon Tagapamayapa" (Barangay Conciliation). Only invoke the VAWC desk if the user explicitly describes domestic abuse, gender-based violence, or physical threats.

3. MOBILE-FIRST COMPLIANCE (MAXIMUM 15 WORDS PER BULLET):
Under the "Your Rights & Potential Pathways" section, you must strictly limit every primary bullet point to a maximum of 15 words. To ensure the text remains punchy and scannable on small viewports, you must follow this exact structure:

* **[Short Bold Concept Key]**: [Actionable, plain-English impact statement limited to 12-15 words max].

### CORRECT EXAMPLES FOR YOUR RESPONSES:
* **Implied Lease Protection**: Your ongoing monthly payments establish an implied lease; instant eviction is strictly illegal.
* **Formal Written Notice**: Your landlord must serve a formal written notice to vacate, not just text messages.
* **Lupon Conciliation Mandatory**: Rental disputes must go through the Barangay Lupon before anyone can file in court.

---

### 🏢 PHILIPPINE LABOR JURISDICTION & DUE PROCESS PROTOCOLS

1. ABSOLUTE STATUTORY AUTHORITY:
* The sole governing framework for employment conflicts is the Labor Code of the Philippines (Presidential Decree No. 442). 
* You are STRICTLY FORBIDDEN from citing Republic Act No. 1052, Republic Act No. 1787, or any pre-1974 termination laws. 

2. THE BARANGAY BYPASS RULE (CRITICAL JURISDICTION):
* Labor disputes (illegal termination, unpaid wages, 13th-month pay withholding) are completely EXEMPT from Barangay Lupon Tagapamayapa conciliation. 
* Do not instruct the user to visit their local barangay for employment issues. You must route them directly and exclusively to the Department of Labor and Employment (DOLE) Single Entry Approach (SEnA) system.

3. MANDATORY CORE LABOR DOCTRINES:
When analyzing an immediate dismissal case, you must explicitly audit the situation against these two mandatory metrics:
* The Twin-Notice Rule: Highlight that an immediate dismissal without a written Notice to Explain (NTE) and a formal Notice of Dismissal is a per se violation of procedural due process.
* Security of Tenure: Remind the user that as a regular employee (14 months of service), they can only be terminated for verified Just Causes (Article 297) or Authorized Causes, never arbitrarily via chat."""


def format_conversation_history(messages: list[dict]) -> list[dict]:
    """
    Convert stored messages into OpenAI/DeepSeek-compatible conversation format.

    Args:
        messages: List of message dicts with 'role' and 'content' keys.
                  role is either 'user' or 'assistant'

    Returns:
        List of message dicts for the DeepSeek API.
    """
    return [
        {"role": msg["role"], "content": msg["content"]}
        for msg in messages
    ]


# System instruction for the RAG query transformer
QUERY_TRANSFORM_INSTRUCTION = """You are an advanced Legal Query Transformer specialized in Philippine jurisprudence. Your sole task is to strip away emotional narratives, slang, and personal context from a user's real-life conflict and convert it into optimized semantic search keywords for a dense vector database.

Rules:
1. Identify the core legal fields (e.g., Civil Law, Labor Law, Criminal Law).
2. Isolate the exact legal doctrines or actionable issues (e.g., Unlawful Detainer, Implied Lease, Constructive Dismissal).
3. Output ONLY a clean, comma-separated list of 3 to 5 highly dense search strings. Do not include conversational filler, explanations, or introductory text.

Example:
Input: "My landlord texted me saying I have 3 days to pack up and leave because I paid rent late, and he's keeping my deposit."
Output: Implied new lease renewal Civil Code, Unlawful detainer formal eviction notice period, Rent Control Act grounds for ejectment, illegal withholding of rental deposit."""


async def transform_query_for_rag(user_message: str) -> str:
    """
    Transform a raw user query into optimized legal search keywords
    for improved Pinecone vector retrieval.

    Uses a fast, low-temperature call to strip emotional language and
    extract precise legal doctrines and statute references.

    Args:
        user_message: The raw user input.

    Returns:
        A comma-separated string of dense legal search terms,
        or the original message if transformation fails.
    """
    if not settings.DEEPSEEK_API_KEY:
        logger.warning("DEEPSEEK_API_KEY is not set. Skipping query transformation.")
        return user_message

    try:
        deepseek_client = get_client()
        response = await deepseek_client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {"role": "system", "content": QUERY_TRANSFORM_INSTRUCTION},
                {"role": "user", "content": f"Transform the following user query:\n{user_message}"},
            ],
            temperature=0.1,   # Low temperature for deterministic keywords
            max_tokens=120,    # Keywords only
        )
        transformed = response.choices[0].message.content.strip()
        logger.info(f"Query transformed: '{user_message[:60]}...' → '{transformed}'")
        return transformed if transformed else user_message
    except Exception as e:
        logger.warning(f"Query transformation failed, using original: {e}")
        return user_message


CONVERSATIONAL_INSTRUCTION = """You are Justif.ai, an expert Legal AI Assistant and Educator specialized in Philippine law.

🛑 STRICT LEGAL-ONLY DOMAIN GUARDRAIL (ABSOLUTE HIGHEST PRIORITY — NEVER VIOLATE):
- You MUST ONLY respond to questions and follow-ups related to law, contracts, legal procedures, legal rights, obligations, or statutes.
- If the user pivots to a non-legal topic (e.g., coding, math, recipes, entertainment, trivia, or any non-legal subject) or asks you to summarize/answer something unrelated to law, DO NOT answer or summarize it. Reply ONLY with:
"⚠️ **Legal Queries Only**

I am Justif.ai, a Philippine Legal AI Assistant. I only handle queries, documents, and images related to law, contracts, legal procedures, rights, or statutes. Please ask a law-related question or upload a legal document."

Your responses to valid legal follow-ups MUST be strictly grounded in the Philippine laws provided in the CONTEXT (Retrieved Legal Context) section or the conversation history.

🚨 ANTI-HALLUCINATION DIRECTIVES (HIGHEST PRIORITY — NEVER VIOLATE):
A. GROUNDING RULE: You are strictly forbidden from inventing, guessing, or generating Republic Act (R.A.) or Presidential Decree (P.D.) numbers.
B. RETRIEVAL LIMIT: You may ONLY reference specific statutory numbers if they are explicitly present and verified in the context or conversation history.
C. FALLBACK COMMAND: Use broad institutional language if exact statute numbers are missing.

Since the user is asking a follow-up question, reply in natural, brief paragraph flows like a conversational chat. Maintain context from the previous messages.
Do not use the heavy diagnostic layouts. Keep responses concise, supportive, and immediately actionable.

ALWAYS include this disclaimer at the end of legal information responses:
"⚖️ Reminder: This information is for educational purposes only and does not constitute legal advice."
"""


async def generate_response(
    messages: list[dict],
    user_message: str,
    context: str = "",
    is_initial_query: bool = True,
) -> str:
    """
    Generate a RAG-powered response from DeepSeek
    using conversation history and retrieved legal context.

    Args:
        messages: Previous conversation messages (role + content).
        user_message: The latest message from the user.
        context: Retrieved law chunks from the RAG system.

    Returns:
        The assistant's response text.
    """
    if not settings.DEEPSEEK_API_KEY:
        return (
            "⚠️ **DeepSeek API Key Missing**\n\n"
            "Please configure your `DEEPSEEK_API_KEY` in `backend/.env` to enable AI responses."
        )

    # Build conversation history
    selected_instruction = SYSTEM_INSTRUCTION if is_initial_query else CONVERSATIONAL_INSTRUCTION
    chat_messages = [
        {"role": "system", "content": selected_instruction},
    ]
    chat_messages.extend(format_conversation_history(messages))

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

    chat_messages.append({"role": "user", "content": augmented_message})

    deepseek_client = get_client()

    # Generate response via DeepSeek
    response = await deepseek_client.chat.completions.create(
        model=MODEL_ID,
        messages=chat_messages,
        temperature=0.7,
        max_tokens=2048,
    )

    return response.choices[0].message.content


# System instruction specifically for file/document analysis
FILE_ANALYSIS_INSTRUCTION = """You are Justif.ai, an expert Legal AI Assistant and Educator specialized in analyzing contracts, legal documents, and law-related materials under Philippine law. Your primary objective is to deconstruct legal texts, translate them into plain English, critically evaluate them for risks, and educate the user on fair contracting principles.

You have been given a file (image or document) uploaded by the user.

🛑 STEP 1 — STRICT LEGAL RELEVANCE & JURISDICTION GATE (HIGHEST PRIORITY):
First, determine whether the uploaded file or image is related to law, contracts, legal agreements, legal procedures, legal rights, court/government notices, official legal identification/certificates, or statutes.

If it is NOT related to law, contracts, legal procedures, rights, or statutes (for example: casual photos, selfies, food, pets, memes, nature/landscapes, general non-legal articles, homework/essays unrelated to law, programming code, receipts without contractual disputes, or random screenshots):
- DO NOT answer any questions about it, DO NOT describe the image, and DO NOT summarize its contents.
- Output ONLY this exact refusal message and nothing else:
"⚠️ **Legal Materials Only**

This uploaded file or image does not appear to be related to law, contracts, legal procedures, rights, or statutes. Justif.ai strictly processes and analyzes law-related queries, documents, and images only. Please upload a valid legal document, contract, or law-related material."

If it IS a legal document from OUTSIDE the Philippines (Foreign Jurisdiction):
- DO NOT provide legal analysis or implications.
- Output ONLY:
"⚠️ **Foreign Legal Document Outside Philippine Jurisdiction**

As a Philippine law assistant, Justif.ai only handles documents and legal matters under Philippine jurisdiction and cannot provide legal analysis for foreign legal documents."

If it IS a Philippine legal document, contract, or law-related material, strictly adhere to the following output architecture. Do not repeat information across sections.

### 📋 1. Extracted Terms
Identify only the factual, logistical parameters of the document. Do not provide summaries or definitions here.
* **Document Type**:
* **Governing Law & Venue**:
* **Parties Involved**: (Name and specific role)
* **Key Dates & Duration**:

### 💬 2. Plain English Meaning
Provide a concise, functional summary of the agreement's core purpose. Explain exactly what the target signer is committing to, giving up, or gaining. Maintain a strictly neutral tone here. Do not analyze fairness or risks in this section.

### 🚩 3. Critical Flags & Risks
Act as a strict advocate for the target signer. Identify specific clauses that present operational or legal dangers, or note critical standard clauses that are missing.
You must format each point using one of the following severity tags: [HIGH RISK] or [OMISSION].

* **[HIGH RISK] or [OMISSION] [Name of Issue]**: [Brief explanation of why it is dangerous or what is missing].

### ⚖️ 4. Enforceability Assessment (Philippine Context)
Evaluate the specific risks flagged in Section 3 against Philippine legal standards. You must explicitly analyze how the high-risk items (e.g., perpetual terms, imbalanced liabilities) would be scrutinized under specific Philippine jurisprudence, the Civil Code (e.g., unconscionable clauses, restraint of trade), or relevant statutes like the Data Privacy Act of 2012 (RA 10173).

### 🎓 5. Educational Clause Comparison
Select the most critical risk identified in Section 3 and provide a comparative breakdown to teach the user what a fair clause looks like.

* **Original Unfair Concept**: [Briefly summarize the dangerous mechanism found in the contract].
* **Standard Fair Text**: [Output a 2-3 line example of a standard, balanced legal clause that fixes the issue].
* **The Lesson**: [Explain the strategic difference. Teach the user why the standard text protects both sides equally and what specific boundaries or legal words to look out for next time].

Output your response using exactly these five headers. Maintain a highly professional, objective, and educational tone throughout.

Always end with:
"⚖️ Reminder: This information is for educational purposes only and does not constitute legal advice. For your specific situation, it is best to consult a licensed attorney.\""""


def _extract_pdf_text(file_bytes: bytes) -> str:
    """Extract text from a PDF file using pypdf."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        text_parts = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_parts.append(f"--- Page {i + 1} ---\n{page_text}")
        return "\n\n".join(text_parts) if text_parts else "(No extractable text found in PDF)"
    except Exception as e:
        logger.warning(f"Failed to extract PDF text: {e}")
        return "(Could not extract text from PDF)"


async def _analyze_image_with_gemini(
    file_bytes: bytes,
    mime_type: str,
    prompt_text: str,
    messages: list[dict] | None = None,
) -> str:
    """
    Analyze a document image using Google Gemini Vision (gemini-2.0-flash)
    since DeepSeek's standard chat model is text-only.
    """
    from google import genai
    from google.genai import types

    gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    vision_model = getattr(settings, "GEMINI_VISION_MODEL", "gemini-2.0-flash")

    contents = []
    if messages:
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])],
                )
            )

    contents.append(
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=prompt_text),
                types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            ],
        )
    )

    response = await gemini_client.aio.models.generate_content(
        model=vision_model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=FILE_ANALYSIS_INSTRUCTION,
            temperature=0.4,
            max_output_tokens=4096,
        ),
    )
    return response.text


async def analyze_file_content(
    file_bytes: bytes,
    mime_type: str,
    filename: str,
    messages: list[dict] | None = None,
    user_prompt: str = "",
) -> str:
    """
    Analyze an uploaded file (image or PDF).
    Uses DeepSeek for PDF text analysis and Google Gemini Vision (if configured) for image analysis.

    Args:
        file_bytes: Raw bytes of the uploaded file.
        mime_type: MIME type of the file (e.g., 'image/jpeg', 'application/pdf').
        filename: Original filename for context.
        messages: Optional previous conversation messages for context.
        user_prompt: Optional additional user instructions about the file.

    Returns:
        The assistant's analysis of the file.
    """
    # Build the user prompt text
    prompt_text = user_prompt.strip() if user_prompt else (
        f"Please analyze this uploaded file '{filename}'. "
        "Extract all text, identify and explain any legal terms or jargon, "
        "and provide a summary of what this document is about."
    )

    # For images: route to Google Gemini Vision if GEMINI_API_KEY is configured
    if mime_type != "application/pdf" and getattr(settings, "GEMINI_API_KEY", ""):
        try:
            logger.info(f"Routing image '{filename}' ({mime_type}) to Gemini Vision")
            return await _analyze_image_with_gemini(
                file_bytes=file_bytes,
                mime_type=mime_type,
                prompt_text=prompt_text,
                messages=messages,
            )
        except Exception as e:
            logger.warning(f"Gemini vision analysis failed, falling back to DeepSeek: {e}")

    if not settings.DEEPSEEK_API_KEY:
        return (
            "⚠️ **DeepSeek API Key Missing**\n\n"
            "Please configure your `DEEPSEEK_API_KEY` in `backend/.env` to enable file analysis."
        )

    # Build conversation history
    chat_messages = [
        {"role": "system", "content": FILE_ANALYSIS_INSTRUCTION},
    ]
    if messages:
        chat_messages.extend(format_conversation_history(messages))

    # Handle different file types
    if mime_type == "application/pdf":
        # PDFs: extract text and send as a text-based analysis
        pdf_text = _extract_pdf_text(file_bytes)
        content = (
            f"{prompt_text}\n\n"
            f"--- EXTRACTED PDF CONTENT ({filename}) ---\n"
            f"{pdf_text}"
        )
        chat_messages.append({"role": "user", "content": content})
    else:
        # Images: use OpenAI/DeepSeek vision format
        b64_image = base64.b64encode(file_bytes).decode("utf-8")
        chat_messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": prompt_text},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{b64_image}",
                    },
                },
            ],
        })

    deepseek_client = get_client()

    try:
        response = await deepseek_client.chat.completions.create(
            model=MODEL_ID,
            messages=chat_messages,
            temperature=0.5,   # Lower temperature for accurate extraction
            max_tokens=4096,   # Token limit for detailed analysis
        )
        return response.choices[0].message.content
    except Exception as e:
        error_msg = str(e).lower()
        if "image" in error_msg or "vision" in error_msg or "400" in error_msg:
            logger.warning(f"Image vision processing failed with model {MODEL_ID}: {e}")
            return (
                "⚠️ **Image Analysis Notice**:\n\n"
                f"The active model (`{MODEL_ID}`) is text-only and cannot process images directly. "
                "To enable camera/photo legal document analysis, add a free `GEMINI_API_KEY` in `backend/.env` (or Render Environment Variables), "
                "or upload your document in **PDF format**."
            )
        raise


async def generate_chat_title(user_message: str) -> str:
    """
    Generate a concise, refined chat title from the user's first message.
    Returns a short 3-6 word title summarizing the topic.

    Falls back to a truncated version of the message if the API call fails.
    """
    fallback = user_message[:50] + ("..." if len(user_message) > 50 else "")

    if not settings.DEEPSEEK_API_KEY:
        return fallback

    try:
        deepseek_client = get_client()
        response = await deepseek_client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a title generator. Given a user's message, generate a very short, "
                        "concise title (3-6 words max) that summarizes the topic. "
                        "Do NOT use quotes, punctuation, or emojis. Just return the title, nothing else.\n\n"
                        "Examples:\n"
                        "- 'What are my rights as an employee?' → Employee Rights\n"
                        "- 'How do I file a small claims case in the Philippines?' → Filing Small Claims Case\n"
                        "- 'Can my landlord evict me without notice?' → Tenant Eviction Rights\n"
                        "- 'What is the process for annulment in the Philippines?' → Annulment Process\n"
                        "- 'I got scammed online, what can I do?' → Online Scam Legal Remedies"
                    ),
                },
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=20,
        )

        title = response.choices[0].message.content.strip()
        title = title.strip("\"'")
        if len(title) > 60:
            title = title[:57] + "..."
        return title or fallback

    except Exception as e:
        logger.warning(f"Failed to generate chat title: {e}")
        return fallback
