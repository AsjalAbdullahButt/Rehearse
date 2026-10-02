from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.common_passwords import is_common_password

NEW_PASSWORD_MIN_LENGTH = 15
"""Raised from the old 8-character minimum — with password-only primary auth and no composition
rules (no forced uppercase/digit/symbol; length is a far better predictor of real-world
crackability than composition, per NIST SP 800-63B), a longer minimum is where the actual
strength budget goes. Spaces and any unicode character are allowed; nothing here restricts the
character set."""

NEW_PASSWORD_MAX_LENGTH = 128
"""Generous, but still bounded — Argon2 hashes its input regardless of length, so an unbounded
password is a cheap way to make every login/register call do disproportionate hashing work."""


def _validate_new_password(value: str) -> str:
    if is_common_password(value):
        raise ValueError("This password is too common. Please choose a less predictable password.")
    return value


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=NEW_PASSWORD_MIN_LENGTH, max_length=NEW_PASSWORD_MAX_LENGTH)
    display_name: str | None = Field(default=None, max_length=255)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        # So "Foo@Example.com" and "foo@example.com" are always the same account — repo's
        # uniqueness check and lookups are exact-match, not case-insensitive.
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def _reject_common_password(cls, value: str) -> str:
        return _validate_new_password(value)


class LoginRequest(BaseModel):
    email: EmailStr
    # Deliberately NOT NEW_PASSWORD_MIN_LENGTH here: a login attempt has to be checkable against
    # whatever password an account was actually created with, including one from before this
    # policy existed (min_length=8 at the time) — rejecting a too-short login attempt before even
    # trying Argon2 would incorrectly lock out an existing user with an old, still-valid password.
    password: str = Field(min_length=1, max_length=NEW_PASSWORD_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


MAX_JWT_LENGTH = 4096
"""A real access/refresh JWT from this API is well under 1KB. 4096 is generous headroom for a
legitimately larger token (more claims added later) while still bounding the input handed to
jwt.decode — an unbounded string field here would let a caller hand this endpoint an arbitrarily
large body to parse for no legitimate reason, on top of the general request-body-size cap in
app/core/middleware.py."""


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=MAX_JWT_LENGTH)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=MAX_JWT_LENGTH)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=NEW_PASSWORD_MAX_LENGTH)
    new_password: str = Field(
        min_length=NEW_PASSWORD_MIN_LENGTH, max_length=NEW_PASSWORD_MAX_LENGTH
    )

    @field_validator("new_password")
    @classmethod
    def _reject_common_password(cls, value: str) -> str:
        return _validate_new_password(value)


class PasswordResetRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class PasswordResetRequestResponse(BaseModel):
    sent: bool = True
    reset_url: str | None = None


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    new_password: str = Field(
        min_length=NEW_PASSWORD_MIN_LENGTH, max_length=NEW_PASSWORD_MAX_LENGTH
    )

    @field_validator("new_password")
    @classmethod
    def _reject_common_password(cls, value: str) -> str:
        return _validate_new_password(value)


class DeleteAccountRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=NEW_PASSWORD_MAX_LENGTH)


class UserPublic(BaseModel):
    id: str
    email: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserPublic
