import time

import jwt
import pytest
from jwt.utils import base64url_encode

from app.core.auth import (
    decode_token,
    hash_password,
    issue_access_token,
    verify_password,
)
from app.core.config import get_settings
from app.core.errors import ApiError


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("correct horse battery staple")

    assert hashed != "correct horse battery staple"
    assert verify_password("correct horse battery staple", hashed) is True


def test_password_hash_rejects_wrong_password() -> None:
    hashed = hash_password("correct horse battery staple")

    assert verify_password("wrong password", hashed) is False


def test_decode_token_rejects_expired_token() -> None:
    # Signed with the actually-configured secret (not a hardcoded literal) so this test is
    # correct under whatever JWT_SECRET the environment sets — a hardcoded value here would
    # mask the real expiry check behind a spurious signature mismatch whenever the two diverge.
    settings = get_settings()
    expired = jwt.encode(
        {"sub": "user-1", "type": "access", "iat": 0, "exp": 1},
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(ApiError) as exc_info:
        decode_token(expired, expected_type="access")

    assert exc_info.value.code == "token_expired"


def test_decode_token_rejects_bad_signature() -> None:
    token = issue_access_token("user-1")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

    with pytest.raises(ApiError) as exc_info:
        decode_token(tampered, expected_type="access")

    assert exc_info.value.code == "token_invalid"


def test_decode_token_rejects_wrong_token_type() -> None:
    access_token = issue_access_token("user-1")

    with pytest.raises(ApiError) as exc_info:
        decode_token(access_token, expected_type="refresh")

    assert exc_info.value.code == "token_invalid"


def test_decode_token_rejects_none_algorithm() -> None:
    # A crafted token that declares alg "none" and drops the signature entirely — the
    # classic JWT bypass. decode_token must reject it because it always passes an explicit
    # algorithms allow-list to jwt.decode, never trusting the token's own header.
    header = base64url_encode(b'{"alg":"none","typ":"JWT"}').decode()
    payload = base64url_encode(
        f'{{"sub":"user-1","type":"access","exp":{int(time.time()) + 3600}}}'.encode()
    ).decode()
    forged = f"{header}.{payload}."

    with pytest.raises(ApiError) as exc_info:
        decode_token(forged, expected_type="access")

    assert exc_info.value.code == "token_invalid"
