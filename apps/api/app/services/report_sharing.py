import hashlib
import secrets


def new_share_token() -> str:
    """URL-safe, high-entropy bearer token for read-only shared reports."""
    return secrets.token_urlsafe(32)


def hash_share_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
