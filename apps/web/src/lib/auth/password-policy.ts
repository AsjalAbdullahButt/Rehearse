// Must match apps/api/app/schemas/auth.py's NEW_PASSWORD_MIN_LENGTH exactly. Client-side
// validation here is UX only (catching the common case before a round trip) — the API's own
// Pydantic validators (length + the common-password blocklist in core/common_passwords.py) are
// the real security boundary and always run regardless of what this constant says.
export const NEW_PASSWORD_MIN_LENGTH = 15;

export const PASSWORD_REQUIREMENTS_HINT = `At least ${NEW_PASSWORD_MIN_LENGTH} characters. Avoid common or easily guessed passwords.`;
