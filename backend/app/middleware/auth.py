"""
Authentication Middleware
Verifies Supabase JWTs to protect API endpoints.
Supports both HMAC (HS256) and ECDSA (ES256) signed tokens.
"""

import jwt
import base64
import logging
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

logger = logging.getLogger(__name__)

# HTTP Bearer token extractor
security = HTTPBearer()

# ─── JWKS Client for ES256 tokens ────────────────────────────
# Supabase exposes public keys at: {SUPABASE_URL}/auth/v1/.well-known/jwks.json
_jwks_client = None


def get_jwks_client() -> PyJWKClient:
    """Lazy-initialize the JWKS client for Supabase's public keys."""
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
        logger.info(f"JWKS client initialized: {jwks_url}")
    return _jwks_client


class AuthenticatedUser:
    """Represents an authenticated user extracted from a valid JWT."""

    def __init__(self, user_id: str, email: str, role: str = "authenticated", token: str = ""):
        self.user_id = user_id
        self.email = email
        self.role = role
        self.token = token

    def __repr__(self):
        return f"AuthenticatedUser(id={self.user_id}, email={self.email})"


def _extract_user(payload: dict, token: str) -> AuthenticatedUser:
    """Extract user info from a decoded JWT payload."""
    user_id = payload.get("sub")
    email = payload.get("email", "")
    role = payload.get("role", "authenticated")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token does not contain a valid user ID.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthenticatedUser(user_id=user_id, email=email, role=role, token=token)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthenticatedUser:
    """
    FastAPI dependency that verifies the Supabase JWT and extracts user info.

    Supports:
      - ES256 tokens (verified via Supabase JWKS endpoint)
      - HS256/HS384 tokens (verified via SUPABASE_JWT_SECRET)

    Usage in route:
        @router.get("/protected")
        async def protected_route(user: AuthenticatedUser = Depends(get_current_user)):
            return {"user_id": user.user_id}

    Raises:
        HTTPException 401: If token is missing, invalid, or expired.
    """
    token = credentials.credentials

    # Read the token header to determine the algorithm
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "")
        kid = header.get("kid")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # ── ES256 / asymmetric: use JWKS public key ──────────
        if alg.startswith("ES") or alg.startswith("RS") or alg.startswith("PS"):
            jwks = get_jwks_client()
            signing_key = jwks.get_signing_key_from_jwt(token)

            # Try with audience, fall back without
            try:
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[alg],
                    audience="authenticated",
                )
            except jwt.InvalidAudienceError:
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[alg],
                    options={"verify_aud": False},
                )

            user = _extract_user(payload, token)
            logger.info(f"Auth OK (JWKS/{alg}): user={user.user_id}")
            return user

        # ── HS256 / symmetric: use JWT secret ────────────────
        else:
            jwt_secret = settings.SUPABASE_JWT_SECRET
            if not jwt_secret:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Server authentication not configured.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Try raw UTF-8 first, then base64-decoded
            secrets_to_try = [jwt_secret.encode("utf-8")]
            try:
                secrets_to_try.append(base64.b64decode(jwt_secret))
            except Exception:
                pass

            last_error = None
            for secret_bytes in secrets_to_try:
                try:
                    payload = jwt.decode(
                        token,
                        secret_bytes,
                        algorithms=["HS256", "HS384", "HS512"],
                        audience="authenticated",
                    )
                    user = _extract_user(payload, token)
                    logger.info(f"Auth OK (HMAC): user={user.user_id}")
                    return user
                except jwt.InvalidAudienceError:
                    # Retry without audience
                    try:
                        payload = jwt.decode(
                            token,
                            secret_bytes,
                            algorithms=["HS256", "HS384", "HS512"],
                            options={"verify_aud": False},
                        )
                        user = _extract_user(payload, token)
                        logger.info(f"Auth OK (HMAC/no-aud): user={user.user_id}")
                        return user
                    except jwt.InvalidTokenError as e:
                        last_error = e
                except jwt.InvalidTokenError as e:
                    last_error = e

            raise jwt.InvalidTokenError(str(last_error))

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
