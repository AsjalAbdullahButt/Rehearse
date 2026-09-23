"""Pure, deterministic metrics computed from a transcript and its word timings. Nothing here
calls an LLM — filler counts, WPM, and pauses must never be guessed by a model (see AGENTS.md).
100% unit-tested in tests/test_metrics.py."""

import re

from app.schemas.transcription import WordTiming

# Single tokens matched by whole-word, case-insensitive comparison against the lowercased
# transcript. Multi-word phrases matched as substrings separately below, since word-boundary
# tokenizing would split them apart. This is a fixed-list heuristic, not an NLP model: it
# will miss fillers phrased unusually, and "like" in particular has a real false-positive
# rate ("I like pizza" counts the same as "it was, like, really hard") — accepted because a
# code-computed metric must stay deterministic, and the LLM's `rambling_notes` field is where
# qualitative judgment belongs instead.
_SINGLE_WORD_FILLERS = frozenset(
    {"um", "umm", "uh", "uhh", "hmm", "er", "erm", "like", "actually", "basically", "literally"}
)
_PHRASE_FILLERS = ("sort of", "kind of", "you know", "i mean")

_WORD_RE = re.compile(r"[a-z']+")

LONG_PAUSE_THRESHOLD_S = 2.0

# A focused interview answer runs 1-2 minutes regardless of how generous the configured time
# cap is (a 5-minute cap shouldn't relax what counts as "rambling") — so this heuristic is
# judged against a fixed 2-minute expectation, plus a grace window so answers that run only
# slightly long aren't flagged.
IDEAL_ANSWER_MAX_S = 120.0
RAMBLING_GRACE_S = 30.0


def count_fillers(transcript: str) -> tuple[int, dict[str, int]]:
    """Returns (total filler count, per-filler breakdown) via fixed-list matching."""
    lowered = transcript.lower()
    breakdown: dict[str, int] = {}

    for word in _WORD_RE.findall(lowered):
        if word in _SINGLE_WORD_FILLERS:
            breakdown[word] = breakdown.get(word, 0) + 1

    for phrase in _PHRASE_FILLERS:
        occurrences = lowered.count(phrase)
        if occurrences:
            breakdown[phrase] = breakdown.get(phrase, 0) + occurrences

    return sum(breakdown.values()), breakdown


def compute_wpm(word_count: int, duration_s: float) -> float:
    """Words per minute, rounded to one decimal. Returns 0.0 for a zero/negative duration
    instead of raising — a near-instant recording is a real input, not an error."""
    if duration_s <= 0:
        return 0.0
    return round(word_count / (duration_s / 60), 1)


def count_long_pauses(words: list[WordTiming]) -> int:
    """Counts gaps between consecutive words that exceed LONG_PAUSE_THRESHOLD_S (2.0s,
    strictly greater than — a gap of exactly 2.0s doesn't count). Fewer than two words means
    there's no gap to measure."""
    if len(words) < 2:
        return 0

    long_pauses = 0
    # words[1:] is deliberately one element shorter than words — that's what makes this a
    # pairwise (current, next) walk, so strict=False here, not a mismatch to fix.
    for previous, current in zip(words, words[1:], strict=False):
        if current.start - previous.end > LONG_PAUSE_THRESHOLD_S:
            long_pauses += 1
    return long_pauses


def assess_rambling(duration_s: float) -> str | None:
    """A coarse length-only proxy: flags "rambling" once an answer runs well past the
    2-minute expectation, regardless of the user's configured time cap. Can't distinguish a
    long *substantive* answer from a padded one — that judgment belongs to the LLM's
    `rambling_notes`, not this heuristic."""
    if duration_s > IDEAL_ANSWER_MAX_S + RAMBLING_GRACE_S:
        return "rambling"
    return None
