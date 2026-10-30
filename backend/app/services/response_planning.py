"""Bounded routing and retrieval identities; no benchmark-specific answers."""
from dataclasses import dataclass
import re

from app.services.law_lookup import named_laws


@dataclass(frozen=True)
class QueryPlan:
    intent: str = "retrieve"
    query: str = ""
    language: str = "auto"
    uses_history: bool = False
    direct_answer: str = ""


def requested_sections(text):
    """Only explicit references, including Filipino; preserve section vs article."""
    found = []
    for match in re.finditer(r"\b(section|sections|sec\.?|seksyon|seksiyon|article|art\.?|artikulo)\s+(\d+[a-z]?)(?!\w)", text, re.I):
        kind = "article" if match[1].lower().startswith(("art",)) else "section"
        identity = (kind, match[2].lower())
        if identity not in found:
            found.append(identity)
    return found[:4]


def retrieval_identity(message, history, uses_history=False):
    """Never allow an LLM-invented law number to become an exact-law filter."""
    if named_laws(message) or not uses_history:
        return message
    for item in reversed(history or []):
        if item.get("role") != "user":
            continue
        previous = item.get("content", "")
        references = named_laws(previous)
        if references:
            identities = " ".join(("IRR of " if r["implementing_rules"] else "") +
                                  f"{r['family']} No. {r['number']}" for r in references)
            sections = "" if requested_sections(message) else " ".join(
                f"{kind} {number}" for kind, number in requested_sections(previous))
            return f"{identities} {sections} {message}"
    return message


def validate_plan(data, message):
    allowed = {"retrieve", "clarify", "missing_document", "refuse", "greeting"}
    if not isinstance(data, dict) or data.get("intent") not in allowed:
        raise ValueError("Invalid planning intent")
    if data.get("language") not in {"en", "fil", "taglish"} or not isinstance(data.get("uses_history"), bool):
        raise ValueError("Invalid planning language/history flag")
    query, answer = data.get("query", ""), data.get("direct_answer", "")
    if not isinstance(query, str) or not isinstance(answer, str):
        raise ValueError("Invalid planning text")
    if data["intent"] != "retrieve":
        if not answer.strip() or len(answer) > 1400:
            raise ValueError("Missing or oversized non-substantive response")
        # Legal explanations belong in evidence-grounded generation. A planner
        # may clarify/decline, but cannot bypass retrieval with cited legal rules.
        if re.search(r"\[source\s*\d|\b(?:section|article|RA|PD|EO)\s*\d", answer, re.I) or named_laws(answer):
            raise ValueError("Planner attempted to supply legal authority")
    return QueryPlan(data["intent"], query[:1200].strip() or message, data["language"], data["uses_history"], answer.strip())


def bounded_history(messages, max_messages=12, max_chars=12000):
    if max_messages <= 0 or max_chars <= 0:
        return []
    selected, remaining = [], max_chars
    for item in reversed((messages or [])[-max_messages:]):
        if item.get("role") not in {"user", "assistant"} or not isinstance(item.get("content"), str):
            continue
        content = item["content"][-min(4000, remaining):]
        if content:
            selected.append({"role": item["role"], "content": content})
            remaining -= len(content)
        if remaining <= 0:
            break
    return list(reversed(selected))
