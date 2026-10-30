"""
Security regression tests for Justif.ai backend.

Covers: JWT verification hardening, upload magic-byte validation, filename
sanitization, rate limiting enforcement, CORS policy, and security headers.
These tests are fully offline (no Supabase / LLM calls).

Run: python -m pytest tests/test_security.py -v
"""

import asyncio
import time
import unittest
import uuid
from unittest.mock import patch

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app.main import app, _rate_limit_key
from app.middleware import auth
from app.routes.chat import _detect_mime_from_bytes, _sanitize_filename

TEST_SECRET = "test-secret-for-security-suite-0123456789abcdef"


def _make_token(secret=TEST_SECRET, alg="HS256", **overrides):
    claims = {
        "sub": str(uuid.uuid4()),
        "email": "user@example.com",
        "role": "authenticated",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, secret, algorithm=alg)


def _verify(token):
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    return asyncio.run(auth.get_current_user(creds))


class JWTVerificationTests(unittest.TestCase):
    def setUp(self):
        p = patch.object(auth.settings, "SUPABASE_JWT_SECRET", TEST_SECRET)
        p.start()
        self.addCleanup(p.stop)

    def assertRejected(self, token):
        with self.assertRaises(HTTPException) as ctx:
            _verify(token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_valid_token_accepted(self):
        user = _verify(_make_token(sub="11111111-1111-1111-1111-111111111111"))
        self.assertEqual(user.user_id, "11111111-1111-1111-1111-111111111111")

    def test_alg_none_rejected(self):
        unsigned = jwt.encode({"sub": "x", "aud": "authenticated"}, None, algorithm="none")
        self.assertRejected(unsigned)

    def test_wrong_secret_rejected(self):
        self.assertRejected(_make_token(secret="attacker-controlled-secret-0123456789"))

    def test_tampered_signature_rejected(self):
        token = _make_token()
        head, body, sig = token.split(".")
        flipped = ("A" if sig[0] != "A" else "B") + sig[1:]
        self.assertRejected(f"{head}.{body}.{flipped}")

    def test_expired_token_rejected(self):
        self.assertRejected(_make_token(exp=int(time.time()) - 60))

    def test_wrong_audience_rejected(self):
        # Previously accepted via a no-audience fallback.
        self.assertRejected(_make_token(aud="some-other-service"))

    def test_missing_audience_rejected(self):
        self.assertRejected(_make_token(aud=None))

    def test_missing_sub_rejected(self):
        self.assertRejected(_make_token(sub=None))

    def test_garbage_token_rejected(self):
        self.assertRejected("not.a.jwt")
        self.assertRejected("' OR 1=1 --")

    def test_malformed_error_does_not_leak_details(self):
        with self.assertRaises(HTTPException) as ctx:
            _verify("garbage")
        self.assertEqual(ctx.exception.detail, "Malformed token.")


class UploadValidationTests(unittest.TestCase):
    def test_detects_supported_types(self):
        self.assertEqual(_detect_mime_from_bytes(b"%PDF-1.7\n..."), "application/pdf")
        self.assertEqual(_detect_mime_from_bytes(b"\x89PNG\r\n\x1a\n...."), "image/png")
        self.assertEqual(_detect_mime_from_bytes(b"\xff\xd8\xff\xe0...."), "image/jpeg")
        self.assertEqual(_detect_mime_from_bytes(b"RIFF\x00\x00\x00\x00WEBPVP8 "), "image/webp")
        self.assertEqual(_detect_mime_from_bytes(b"\x00\x00\x00\x18ftypheic...."), "image/heic")

    def test_rejects_spoofed_content(self):
        self.assertIsNone(_detect_mime_from_bytes(b"MZ\x90\x00 windows executable"))
        self.assertIsNone(_detect_mime_from_bytes(b"#!/bin/sh\nrm -rf /"))
        self.assertIsNone(_detect_mime_from_bytes(b"<html><script>alert(1)</script>"))
        self.assertIsNone(_detect_mime_from_bytes(b""))

    def test_endpoint_rejects_spoofed_pdf(self):
        client = TestClient(app)
        with patch.object(auth.settings, "SUPABASE_JWT_SECRET", TEST_SECRET):
            r = client.post(
                "/api/chat/analyze-file",
                headers={"Authorization": f"Bearer {_make_token()}"},
                files={"file": ("contract.pdf", b"MZ\x90\x00fake exe", "application/pdf")},
            )
        self.assertEqual(r.status_code, 400)

    def test_filename_sanitized(self):
        self.assertEqual(_sanitize_filename("../../etc/passwd"), "passwd")
        self.assertEqual(_sanitize_filename("..\\..\\secret.txt"), "secret.txt")
        self.assertEqual(_sanitize_filename("a\x00b\nc.pdf"), "abc.pdf")
        self.assertEqual(_sanitize_filename(None), "uploaded_file")
        self.assertLessEqual(len(_sanitize_filename("x" * 1000)), 120)


class RateLimitTests(unittest.TestCase):
    def test_key_uses_user_id_when_token_present(self):
        token = _make_token(sub="abc-user")
        scope = {"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())],
                 "client": ("1.2.3.4", 1234)}
        from starlette.requests import Request
        self.assertEqual(_rate_limit_key(Request(scope)), "user:abc-user")

    def test_key_falls_back_to_ip(self):
        from starlette.requests import Request
        scope = {"type": "http", "headers": [], "client": ("1.2.3.4", 1234)}
        self.assertEqual(_rate_limit_key(Request(scope)), "ip:1.2.3.4")

    def test_limit_is_enforced(self):
        """Default limit must actually trigger 429 (it was previously never enforced)."""
        from app.config import settings
        limit = int(settings.RATE_LIMIT.split("/")[0])
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {_make_token(secret='forged-0123456789abcdefghijklmnop')}"}
        codes = [client.get("/api/chats", headers=headers).status_code for _ in range(limit + 1)]
        self.assertTrue(all(c == 401 for c in codes[:limit]), codes)
        self.assertEqual(codes[-1], 429)

    def test_health_is_exempt(self):
        from app.config import settings
        limit = int(settings.RATE_LIMIT.split("/")[0])
        client = TestClient(app)
        codes = {client.get("/health").status_code for _ in range(limit + 5)}
        self.assertEqual(codes, {200})


class HeadersAndCORSTests(unittest.TestCase):
    def test_security_headers_present(self):
        r = TestClient(app).get("/health")
        self.assertEqual(r.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(r.headers.get("x-frame-options"), "DENY")
        self.assertIn("referrer-policy", r.headers)

    def test_no_credentialed_cors_for_arbitrary_origin(self):
        evil = "https://evil.example.com"
        r = TestClient(app).options(
            "/api/chats",
            headers={"Origin": evil, "Access-Control-Request-Method": "GET"},
        )
        echoed = r.headers.get("access-control-allow-origin") == evil
        creds = r.headers.get("access-control-allow-credentials") == "true"
        self.assertFalse(echoed and creds, "Arbitrary origin received credentialed CORS access")

    def test_docs_disabled_in_production(self):
        from app.config import settings
        if settings.DEBUG:
            self.skipTest("DEBUG=true locally; docs intentionally enabled")
        self.assertEqual(TestClient(app).get("/docs").status_code, 404)


if __name__ == "__main__":
    unittest.main()
