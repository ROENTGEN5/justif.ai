"""Authenticated SSE evaluation without retries or automatic resubmission."""
import asyncio
import json
import os
import time


class StreamFailure(RuntimeError):
    def __init__(self, message, partial_answer="", first_answer_seconds=None):
        super().__init__(message)
        self.partial_answer = partial_answer
        self.first_answer_seconds = first_answer_seconds


class StreamCollector:
    def __init__(self):
        self.started = time.perf_counter()
        self.first = None
        self.parts = []
        self.done = None
        self.data = []

    def line(self, line):
        if line.startswith("data:"):
            self.data.append(line[5:].lstrip(" "))
        elif not line and self.data:
            payload, self.data = "\n".join(self.data), []
            try:
                event = json.loads(payload)
                if not isinstance(event, dict):
                    raise ValueError("Expected object")
            except (ValueError, TypeError) as exc:
                raise self.failure("Malformed stream event") from exc
            if self.done is not None:
                raise self.failure("Event after completion")
            kind = event.get("type")
            if kind == "error":
                raise self.failure(str(event.get("detail", "Stream error")))
            if kind == "token":
                value = event.get("text")
                if not isinstance(value, str):
                    raise self.failure("Invalid token")
                if value:
                    if self.first is None:
                        self.first = time.perf_counter() - self.started
                    self.parts.append(value)
            elif kind == "done":
                answer = event.get("response")
                if not isinstance(answer, str) or not answer.strip() or not event.get("chat_id"):
                    raise self.failure("Invalid completion")
                if self.parts and "".join(self.parts) != answer:
                    raise self.failure("Streamed and saved answers differ")
                self.done = event
            elif kind != "thinking":
                raise self.failure("Unknown stream event")

    def failure(self, message):
        return StreamFailure(message, "".join(self.parts), self.first)

    def result(self):
        if self.done is None or self.data:
            raise self.failure("Incomplete stream")
        return dict(answer=self.done["response"], sources=self.done.get("sources", []),
                    chat_id=self.done["chat_id"], message_id=self.done.get("message_id"),
                    first_answer_seconds=self.first, retrieved_chunks=None, exact_context=None)


async def stream_api(case, args):
    import httpx
    token = os.environ.get("JUSTIFAI_EVAL_TOKEN")
    if not token:
        raise ValueError("Set JUSTIFAI_EVAL_TOKEN to a test user's access token")
    collector = StreamCollector()
    chat_id = None
    try:
        async with asyncio.timeout(args.timeout):
            async with httpx.AsyncClient(timeout=args.timeout) as client:
                for question in [*case.get("prior_user_turns", []), case["question"]]:
                    collector = StreamCollector()
                    async with client.stream("POST", args.api_url.rstrip("/") + "/api/chat/stream",
                            headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
                            json={"message": question, "chat_id": chat_id, "law_types": case.get("law_types")}) as response:
                        response.raise_for_status()
                        if "text/event-stream" not in response.headers.get("content-type", ""):
                            raise collector.failure("Expected event-stream response")
                        async for line in response.aiter_lines():
                            collector.line(line)
                    result = collector.result()
                    chat_id = result["chat_id"]
                return result
    except StreamFailure:
        raise
    except Exception as exc:
        # Avoid placing request headers or authentication details in reports.
        raise collector.failure(type(exc).__name__) from exc
