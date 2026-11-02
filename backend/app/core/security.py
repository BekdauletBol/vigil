"""Password hashing (scrypt, stdlib) and JWT access tokens."""

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    b64 = base64.urlsafe_b64encode
    return f"scrypt${_N}${_R}${_P}${b64(salt).decode()}${b64(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        expected = base64.urlsafe_b64decode(digest)
        actual = hashlib.scrypt(
            password.encode(),
            salt=base64.urlsafe_b64decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def create_access_token(user_id: int, secret: str, ttl_hours: int) -> str:
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(hours=ttl_hours)}
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str, secret: str) -> int | None:
    try:
        return int(jwt.decode(token, secret, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


API_KEY_PREFIX = "vk_"


def new_api_key() -> tuple[str, str, str]:
    """Return (plaintext key, sha256 hash to store, short prefix for display)."""
    key = API_KEY_PREFIX + secrets.token_urlsafe(24)
    return key, hash_api_key(key), key[:10]


def hash_api_key(key: str) -> str:
    # API keys are high-entropy random strings, so a fast hash is appropriate (unlike passwords).
    return hashlib.sha256(key.encode()).hexdigest()
