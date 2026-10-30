"""Recover a requested statutory section from consecutive indexed chunks."""
import re

# Statutory headings have a numeric label followed by a dot. A bare mention
# such as "under Section 8 of this Act" is not a heading.
HEADINGS = re.compile(
    r"((?<!\w)(?:SEC(?:TION)?\.?|ART(?:ICLE)?\.?)|"
    r"(?-i:(?<=[a-z])(?:SEC\.|SECTION|ART\.|ARTICLE)))\s+(\d+[a-z]?)\s*\.(?!\d)", re.I)


def headings(text):
    return [(m.start(), m.end(), "article" if m[1].lower().startswith("art") else "section", m[2].lower())
            for m in HEADINGS.finditer(text)]


def join_overlap(left, right):
    # Only remove an EXACT suffix/prefix overlap. Changed wording or numbers
    # must never be collapsed as equivalent legal evidence.
    for length in range(min(len(left), len(right), 500), 19, -1):
        if left[-length:] == right[:length]:
            return left + right[length:]
    return left + "\n" + right


def section_excerpt(text, target, at_document_end=False, max_chars=8000):
    found = headings(text)
    for i, (start, end, kind, number) in enumerate(found):
        if (kind, number) != target:
            continue
        following = next((h for h in found[i + 1:] if h[2] == kind and (h[2], h[3]) != target), None)
        finish = following[0] if following else len(text)
        complete = bool(following) or at_document_end
        content = text[start:finish].strip()
        if len(content) > max_chars:
            content, complete = content[:max_chars], False
        if not complete:
            content += "\n[Evidence excerpt ends here; the rest of this provision was not recovered.]"
        return content, complete
    return None
