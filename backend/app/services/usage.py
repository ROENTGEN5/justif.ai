"""Request-local provider token observations, without logging user content."""
from contextvars import ContextVar

completion_usage = ContextVar("completion_usage", default=None)


def record_completion(response, stage):
    records = completion_usage.get()
    if records is None:
        return
    usage = getattr(response, "usage", None)
    records.append({"stage": stage, "model": getattr(response, "model", None),
                    "prompt_tokens": getattr(usage, "prompt_tokens", None),
                    "completion_tokens": getattr(usage, "completion_tokens", None),
                    "prompt_cache_hit_tokens": getattr(usage, "prompt_cache_hit_tokens", None)})
