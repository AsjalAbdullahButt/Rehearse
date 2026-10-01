"""The interview languages Rehearse actually supports end to end. A language is only listed here
if Groq's Whisper can transcribe it (`whisper_code`) — advertising one the speech provider can't
handle would let a session start in a language its answers can't be transcribed in.

`speech_tag` is the BCP-47 tag handed to the browser's SpeechRecognition (live captions) and
SpeechSynthesis (question read-aloud); browser support for a given tag varies by platform, so the
frontend treats both as best-effort and the authoritative transcript always comes from Whisper."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    code: str
    name: str
    whisper_code: str
    speech_tag: str


SUPPORTED_LANGUAGES: dict[str, Language] = {
    lang.code: lang
    for lang in (
        Language("en", "English", "en", "en-US"),
        Language("ur", "Urdu", "ur", "ur-PK"),
        Language("hi", "Hindi", "hi", "hi-IN"),
        Language("pa", "Punjabi", "pa", "pa-IN"),
    )
}

DEFAULT_LANGUAGE = "en"


def resolve_language(code: str | None) -> Language:
    """Lenient on purpose: sessions created before language validation existed may hold a
    free-form string (or None), which must still resolve rather than break old reports."""
    if code is None:
        return SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE]
    return SUPPORTED_LANGUAGES.get(code.strip().lower(), SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE])
