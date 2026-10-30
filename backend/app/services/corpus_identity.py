"""Stable document identity shared by indexing and neighbor retrieval."""
import hashlib
from urllib.parse import urlsplit, urlunsplit


def chunk_id(url, index):
    parts = urlsplit(url.strip())
    if parts.scheme not in ('http', 'https') or not parts.netloc:
        raise ValueError('Document requires an absolute source URL')
    canonical = urlunsplit(('https', parts.netloc.lower(), parts.path.rstrip('/'), parts.query, ''))
    return 'v2-' + hashlib.sha256(canonical.encode()).hexdigest() + '-' + str(index)
