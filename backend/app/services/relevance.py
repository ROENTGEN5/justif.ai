"""Small local lexical reranker; makes no external calls and needs no index rebuild."""
from collections import Counter
import math
import re

STOP_WORDS = set("a an the of to in on for and or is are was were be been being by with from as at it its this that what which how why when where who my me i you your our their have has do does under about philippines philippine law laws legal provisions question please explain".split())


def tokens(text):
    words = re.findall(r"[a-z0-9]+", text.casefold())
    return [w[:-1] if len(w) > 4 and w.endswith("s") and not w.endswith("ss") else w
            for w in words if w not in STOP_WORDS and len(w) > 1]


def lexical_scores(query, documents):
    """BM25 query coverage within the semantic candidate pool (not the corpus)."""
    terms = set(tokens(query))
    counts = [Counter(tokens(doc)) for doc in documents]
    lengths = [sum(c.values()) for c in counts]
    average = sum(lengths) / max(len(lengths), 1) or 1
    scores = [0.0] * len(documents)
    for term in terms:
        frequency = sum(term in c for c in counts)
        weight = math.log(1 + (len(counts) - frequency + .5) / (frequency + .5))
        for i, counter in enumerate(counts):
            tf = counter[term]
            scores[i] += weight * (tf * 2.2) / (tf + 1.2 * (.25 + .75 * lengths[i] / average))
    return scores
