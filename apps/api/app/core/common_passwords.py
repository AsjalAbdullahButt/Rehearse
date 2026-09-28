"""A small, local, offline blocklist of extremely common/breached passwords — deliberately not a
live k-anonymity call to an external breach-checking API (e.g. Have I Been Pwned), since this
project has no credential/infra budget for that integration; see AGENTS.md's known-gaps notes.
This is a coarse net for the most obviously weak passwords (top breach-list entries, keyboard
walks, trivial variations), not a substitute for the length/entropy floor RegisterRequest and
ChangePasswordRequest already enforce — a password can fail this check even at 15+ characters if
it's a well-known phrase, and can pass this check and still be weak in ways this list can't catch.
Matching is case-insensitive and strips common leading/trailing digits/punctuation so obvious
variants ("Password123!", "qwerty123") are still caught."""

import re

_COMMON_PASSWORDS: frozenset[str] = frozenset(
    {
        "password",
        "123456",
        "123456789",
        "12345678",
        "1234567890",
        "1234567",
        "qwerty",
        "qwertyuiop",
        "qwerty123",
        "abc123",
        "abcd1234",
        "111111",
        "112233",
        "123123",
        "123321",
        "000000",
        "1q2w3e4r",
        "1q2w3e4r5t",
        "1qaz2wsx",
        "letmein",
        "welcome",
        "welcome1",
        "monkey",
        "dragon",
        "master",
        "login",
        "admin",
        "administrator",
        "iloveyou",
        "starwars",
        "trustno1",
        "sunshine",
        "princess",
        "football",
        "baseball",
        "basketball",
        "superman",
        "batman",
        "shadow",
        "michael",
        "jennifer",
        "jordan",
        "hunter",
        "hunter2",
        "freedom",
        "whatever",
        "passw0rd",
        "password1",
        "password123",
        "p@ssword",
        "p@ssw0rd",
        "changeme",
        "letmein123",
        "zaq1zaq1",
        "qazwsx",
        "asdfghjkl",
        "asdf1234",
        "zxcvbnm",
        "654321",
        "121212",
        "aaaaaa",
        "1111111",
        "11111111",
        "target123",
        "access123",
        "flower",
        "summer",
        "winter",
        "autumn",
        "spring",
        "cheese",
        "george",
        "charlie",
        "thomas",
        "hannah",
        "michelle",
        "daniel",
        "andrew",
        "joshua",
        "matthew",
        "ashley",
        "nicole",
        "amanda",
        "computer",
        "internet",
        "keyboard",
        "mustang",
        "corvette",
        "ferrari",
        "harley",
        "buster",
        "ranger",
        "tigger",
        "cookie",
        "coffee",
        "chicken",
        "orange",
        "purple",
        "blink182",
        "linkedin",
        "facebook",
        "myspace",
        "twitter",
        "google",
        "yahoo",
        "hotmail",
        "outlook",
        "newpassword",
        "temppassword",
        "temp1234",
        "test1234",
        "testing123",
        "guest1234",
        "default",
        "changeme123",
        "ilovepizza",
        "iloveyou123",
        "loveme",
        "forever",
        "believe",
        "beautiful",
        "wonderful",
        "happiness",
        "hello123",
        "whatsupp",
        "rehearse",
        "interview",
        "interview123",
    }
)

_INTERNAL_NON_ALNUM = re.compile(r"[^a-z0-9]")


def _normalize(password: str) -> str:
    return _INTERNAL_NON_ALNUM.sub("", password.strip().lower())


def is_common_password(password: str) -> bool:
    """True if `password` (case/punctuation-insensitively) matches a known-common entry, or is
    that entry with a handful of trailing digits appended (the single most common way people
    "strengthen" a weak base password, e.g. "password123!")."""
    normalized = _normalize(password)
    if normalized in _COMMON_PASSWORDS:
        return True
    # Strip a trailing digit run and re-check the base word — catches "password2024",
    # "qwerty99", etc. without needing every numbered variant listed explicitly.
    stripped = re.sub(r"\d+$", "", normalized)
    return stripped != normalized and stripped in _COMMON_PASSWORDS
