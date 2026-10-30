"""Recognize explicit law identifiers without relying on an LLM rewrite."""
import re

# Article/section numbers alone are not law identities. Family and number must
# both be present, so RA 649 never matches RA 6640 or PD 649.
FAMILIES = (
    ("Republic Act", r"(?:republic\s+act|r\.?\s*a\.?)", ("Republic Act", "R.A.", "RA")),
    ("Presidential Decree", r"(?:presidential\s+decree|p\.?\s*d\.?)", ("Presidential Decree", "P.D.", "PD")),
    ("Executive Order", r"(?:executive\s+order|e\.?\s*o\.?)", ("Executive Order", "E.O.", "EO")),
    ("Batas Pambansa", r"(?:batas\s+pambansa|b\.?\s*p\.?)", ("Batas Pambansa", "B.P.", "BP")),
    ("Commonwealth Act", r"(?:commonwealth\s+act|c\.?\s*a\.?)", ("Commonwealth Act", "C.A.", "CA")),
)


def named_laws(text):
    found = []
    for family, pattern, aliases in FAMILIES:
        for match in re.finditer(r"\b" + pattern + r"\s*(?:no\.?\s*)?(\d[\d,]*)(?!\w)", text, re.I):
            number = match.group(1).replace(",", "").lstrip("0") or "0"
            # A comma may be sentence punctuation; retain digits only.
            if not number.isdigit():
                continue
            identity = (family, number)
            rules = bool(re.search(r"(?:\birr|implementing\s+rules(?:\s+and\s+regulations)?)(?:\s+of)?\s*$",
                                   text[:match.start()], re.I))
            if (family, number, rules) not in [(r["family"], r["number"], r["implementing_rules"]) for _, r in found]:
                found.append((match.start(), {"family": family, "number": number, "aliases": aliases,
                                               "implementing_rules": rules}))
    return [ref for _, ref in sorted(found, key=lambda item: item[0])]


def title_variants(reference):
    number = reference["number"]
    numbers = {number, f"{int(number):,}"}
    variants = set()
    for alias in reference["aliases"]:
        for n in numbers:
            for label in (f"{alias} No. {n}", f"{alias} No.{n}", f"{alias} No {n}", f"{alias} {n}", f"{alias}{n}"):
                labels = ([prefix + label for prefix in ("IRR of ", "Irr of ", "NPC Irr of ")]
                          if reference.get("implementing_rules") else [label])
                for title in labels:
                    variants.update((title, title.upper(), title.lower()))
    return sorted(variants)


def law_filter(reference, law_types=None):
    identity_filter = {"short_title": {"$in": title_variants(reference)}}
    if law_types:
        return {"$and": [identity_filter, {"label": {"$in": law_types}}]}
    return identity_filter
