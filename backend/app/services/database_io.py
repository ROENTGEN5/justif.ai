"""Bound database work without blocking the API event loop."""
from functools import partial
import anyio

_limiter = None


async def run_db(function, *args, **kwargs):
    global _limiter
    if _limiter is None:
        _limiter = anyio.CapacityLimiter(8)
    # Keep the slot until the worker returns, even when the caller is canceled.
    return await anyio.to_thread.run_sync(partial(function, *args, **kwargs), limiter=_limiter)
