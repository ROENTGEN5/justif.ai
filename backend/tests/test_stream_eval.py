import json
import unittest
from scripts.stream_eval import StreamCollector, StreamFailure


class StreamTests(unittest.TestCase):
    def emit(self, collector, event):
        collector.line("data: " + json.dumps(event))
        collector.line("")

    def test_status_is_not_first_answer(self):
        c = StreamCollector("request-example")
        self.emit(c, {"type": "thinking"})
        self.emit(c, {"type": "token", "text": " "})
        self.assertIsNone(c.first)
        self.emit(c, {"type": "token", "text": "Hello"})
        self.emit(c, {"type": "done", "response": " Hello", "chat_id": "test"})
        result = c.result()
        self.assertEqual(result["answer"], " Hello")
        self.assertEqual(result["request_id"], "request-example")
        self.assertLessEqual(result["first_status_seconds"], result["first_answer_seconds"])

    def test_disconnect_keeps_partial(self):
        c = StreamCollector()
        self.emit(c, {"type": "token", "text": "Partial"})
        with self.assertRaises(StreamFailure) as caught:
            c.result()
        self.assertEqual(caught.exception.partial_answer, "Partial")

    def test_malformed_error_and_mismatch_fail(self):
        for event in ({"type": "error", "detail": "Unavailable"},
                      {"type": "done", "response": "different", "chat_id": "test"},
                      {"type": "token", "text": 42}):
            c = StreamCollector()
            self.emit(c, {"type": "token", "text": "Partial"})
            with self.assertRaises(StreamFailure):
                self.emit(c, event)
        c = StreamCollector()
        c.line("data: invalid")
        with self.assertRaises(StreamFailure):
            c.line("")
