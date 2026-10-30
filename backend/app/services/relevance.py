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


def phrase_scores(query, documents):
    """Reward intact concepts, not isolated words shared with adjacent topics.

    Use consecutive non-stopword pairs without bridging stopwords. This is a
    bounded ranking signal, never a filter: paraphrases and translations remain
    eligible even without an exact phrase match.
    """
    words = re.findall(r"[a-z0-9]+", query.casefold())
    phrases = {(a, b) for a, b in zip(words, words[1:])
               if a not in STOP_WORDS and b not in STOP_WORDS and len(a) > 1 and len(b) > 1}
    scores = []
    for document in documents:
        words = re.findall(r"[a-z0-9]+", document.casefold())
        pairs = set(zip(words, words[1:]))
        scores.append(len(phrases & pairs) / max(len(phrases), 1))
    return scores
