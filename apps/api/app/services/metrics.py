"""Pure, deterministic metrics computed from a transcript and its word timings. Nothing here
calls an LLM — filler counts, WPM, and pauses must never be guessed by a model (see AGENTS.md).
100% unit-tested in tests/test_metrics.py."""

import re
from typing import NamedTuple

from app.models.enums import Category
from app.schemas.transcription import TranscriptPart, WordTiming

# Split into two confidence tiers rather than one flat list. "um"/"uh"/"erm"/"hmm" are almost
# never anything but disfluencies. "like"/"actually"/"basically"/"literally" (and the phrase
# fillers below) have a real false-positive rate in ordinary grammatical use ("I like pizza",
# "it actually worked") — counting them the same as "um" would overstate how disfluent an
# answer sounded. `filler_count`/`filler_breakdown` (the number shown as *the* headline metric)
# only reflect the definite tier; the possible tier is reported separately as a softer signal,
# never merged back in. This is still a fixed-list heuristic, not real contextual disambiguation
# (that would need an NLP model, which the rest of this module deliberately avoids) — see
# AGENTS.md's rule that a filler count must be code-computed and deterministic.
_DEFINITE_FILLERS = frozenset({"um", "umm", "uh", "uhh", "er", "erm", "hmm"})
_POSSIBLE_FILLERS = frozenset({"like", "actually", "basically", "literally"})
_POSSIBLE_PHRASE_FILLERS = ("sort of", "kind of", "you know", "i mean")

_WORD_RE = re.compile(r"[a-z']+")

LONG_PAUSE_THRESHOLD_S = 2.0

# A focused interview answer runs 1-2 minutes regardless of how generous the configured time
# cap is (a 5-minute cap shouldn't relax what counts as "rambling") — so this heuristic is
# judged against a fixed 2-minute expectation, plus a grace window so answers that run only
# slightly long aren't flagged. See assess_rambling for how this combines with the session's
# own answer_cap_s and a content-density/repetition check.
IDEAL_ANSWER_MAX_S = 120.0
RAMBLING_GRACE_S = 30.0


class FillerCounts(NamedTuple):
    definite_count: int
    definite_breakdown: dict[str, int]
    possible_count: int
    possible_breakdown: dict[str, int]


def count_fillers(transcript: str) -> FillerCounts:
    """Returns definite and possible filler counts/breakdowns separately — see the module
    docstring's confidence-tier note for why "like"/"actually"/etc. never get folded into the
    definite count."""
    lowered = transcript.lower()
    definite: dict[str, int] = {}
    possible: dict[str, int] = {}

    for word in _WORD_RE.findall(lowered):
        if word in _DEFINITE_FILLERS:
            definite[word] = definite.get(word, 0) + 1
        elif word in _POSSIBLE_FILLERS:
            possible[word] = possible.get(word, 0) + 1

    for phrase in _POSSIBLE_PHRASE_FILLERS:
        occurrences = lowered.count(phrase)
        if occurrences:
            possible[phrase] = possible.get(phrase, 0) + occurrences

    return FillerCounts(
        definite_count=sum(definite.values()),
        definite_breakdown=definite,
        possible_count=sum(possible.values()),
        possible_breakdown=possible,
    )


def filler_rate_per_100_words(filler_count: int, word_count: int) -> float:
    """Definite-filler rate normalized per 100 words, so a 30-second and a 3-minute answer are
    comparable — a coaching signal, not a verdict (see assess_confidence for the same idea)."""
    if word_count <= 0:
        return 0.0
    return round(filler_count / word_count * 100, 1)


def compute_wpm(word_count: int, duration_s: float) -> float:
    """Words per minute, rounded to one decimal. Returns 0.0 for a zero/negative duration
    instead of raising — a near-instant recording is a real input, not an error."""
    if duration_s <= 0:
        return 0.0
    return round(word_count / (duration_s / 60), 1)


def _gaps_s(words: list[WordTiming]) -> list[float]:
    if len(words) < 2:
        return []
    # words[1:] is deliberately one element shorter than words — that's what makes this a
    # pairwise (current, next) walk, so strict=False here, not a mismatch to fix.
    pairs = zip(words, words[1:], strict=False)
    return [current.start - previous.end for previous, current in pairs]


def count_long_pauses(words: list[WordTiming]) -> int:
    """Counts gaps between consecutive words that exceed LONG_PAUSE_THRESHOLD_S (2.0s,
    strictly greater than — a gap of exactly 2.0s doesn't count)."""
    return sum(1 for gap in _gaps_s(words) if gap > LONG_PAUSE_THRESHOLD_S)


def max_pause_s(words: list[WordTiming]) -> float | None:
    """None (not 0.0) when there's fewer than two words — there's no gap to measure at all,
    which reads differently from "measured, and the longest gap was zero"."""
    gaps = _gaps_s(words)
    return round(max(gaps), 2) if gaps else None


def total_long_pause_s(words: list[WordTiming]) -> float:
    return round(sum(gap for gap in _gaps_s(words) if gap > LONG_PAUSE_THRESHOLD_S), 2)


def avg_pause_s(words: list[WordTiming]) -> float | None:
    """Average of the *positive* gaps only ("where meaningful" — a zero or negative gap is
    Whisper's word timings touching or overlapping, not a pause worth averaging in). None when
    there are no positive gaps to average, same reasoning as max_pause_s."""
    positive_gaps = [gap for gap in _gaps_s(words) if gap > 0]
    return round(sum(positive_gaps) / len(positive_gaps), 2) if positive_gaps else None


def build_transcript_parts(words: list[WordTiming]) -> list[TranscriptPart]:
    """Rebuilds the transcript as text/filler/pause parts for the report page's word-level
    highlighting — the single source of truth for what's a filler/pause, so the web app never
    re-implements this heuristic in TypeScript.

    Only *definite* single-word fillers are highlighted, not the possible tier ("like",
    "actually", ...) or the multi-word phrases count_fillers also matches — those are too
    context-dependent to visually flag as a clear negative in a display-only heuristic. This
    means the highlighted word count can differ from filler_count/filler_breakdown; that's a
    known, accepted gap between the two, same as before this file's docstring already noted for
    phrase fillers."""
    parts: list[TranscriptPart] = []

    for index, word in enumerate(words):
        if index > 0:
            gap = word.start - words[index - 1].end
            if gap > LONG_PAUSE_THRESHOLD_S:
                parts.append(TranscriptPart(type="pause", seconds=round(gap, 1)))

        cleaned = word.word.strip().lower().strip(".,!?;:")
        part_type = "filler" if cleaned in _DEFINITE_FILLERS else "text"
        suffix = "" if index == len(words) - 1 else " "
        parts.append(TranscriptPart(type=part_type, text=f"{word.word}{suffix}"))

    return parts


# A long answer only reads as "rambling" when it's ALSO either sparse (mostly dead air, not
# content) or repetitive — a long but dense, non-repetitive answer is substantive, not padded.
# Technical answers get more duration leeway: a real deep-dive legitimately runs longer than a
# behavioral story.
RAMBLING_MIN_SUBSTANTIVE_WPM = 90.0
RAMBLING_REPETITION_THRESHOLD = 0.05
_TECHNICAL_DURATION_ALLOWANCE = 1.2


def _immediate_repetition_ratio(words: list[WordTiming]) -> float:
    """Fraction of words that are an exact (case-insensitive) repeat of the immediately
    preceding word — a cheap, deterministic proxy for padded/repetitive speech ("the the",
    "I I think"), distinct in kind from a long but substantive answer."""
    if len(words) < 2:
        return 0.0
    repeats = sum(
        1
        for previous, current in zip(words, words[1:], strict=False)
        if previous.word.strip().lower() == current.word.strip().lower()
    )
    return repeats / (len(words) - 1)


def assess_rambling(
    words: list[WordTiming],
    *,
    duration_s: float,
    answer_cap_s: int,
    category: Category | None = None,
) -> str | None:
    """Duration alone is no longer sufficient to flag rambling (a coarse length-only proxy
    can't distinguish a long substantive answer from a padded one) — this also weighs word
    density (WPM) and immediate-word repetition, and stretches the expected duration for
    technical questions, which legitimately run longer than a behavioral story. Still a
    heuristic, not a judgment: the LLM's free-text `rambling_notes` is where real qualitative
    assessment belongs."""
    expected_max_s = max(IDEAL_ANSWER_MAX_S, answer_cap_s * 0.9)
    if category == Category.TECHNICAL:
        expected_max_s *= _TECHNICAL_DURATION_ALLOWANCE

    if duration_s <= expected_max_s + RAMBLING_GRACE_S:
        return None

    word_count = len(words)
    wpm = compute_wpm(word_count, duration_s)
    repetition_ratio = _immediate_repetition_ratio(words)
    is_dense_and_original = (
        wpm >= RAMBLING_MIN_SUBSTANTIVE_WPM and repetition_ratio < RAMBLING_REPETITION_THRESHOLD
    )
    if is_dense_and_original:
        return None
    return "rambling"


# A filler rate below this reads as normal, unremarkable speech — not worth surfacing. Gated
# by a minimum count too, so a short answer with a single "um" (a high rate over few words)
# doesn't get flagged; there has to be an actual pattern, not just a small sample size.
CONFIDENCE_FILLER_RATE_THRESHOLD = 0.08
CONFIDENCE_MIN_FILLER_COUNT = 3


def assess_confidence(filler_count: int, word_count: int) -> str | None:
    """A coarse, code-computed confidence signal from filler-word density alone (never the
    LLM's job — see module docstring). A high filler rate doesn't mean the content was wrong,
    so this is written as a delivery tip to try next time, not a criticism of this answer —
    the report surfaces it alongside an invitation to practice again, not as a red mark.
    Returns None for a zero-word transcript (nothing to rate) or below either threshold."""
    if word_count <= 0:
        return None

    rate = filler_count / word_count
    if filler_count < CONFIDENCE_MIN_FILLER_COUNT or rate <= CONFIDENCE_FILLER_RATE_THRESHOLD:
        return None

    return (
        'You leaned on filler words like "um" and "uh" quite a bit here — completely normal '
        "under pressure, but trimming them reads as more confident and composed, even when "
        "you're still gathering your thoughts. Try pausing silently instead of filling the "
        "gap next time you practice."
    )


# Whisper's verbose_json segments carry avg_logprob (roughly, how confident the model was in
# its own output — closer to 0 is more confident, more negative is less) and no_speech_prob
# (how likely the model thought a segment was actually silence/noise rather than speech). These
# are real numbers Groq returns, propagated as-is from app/services/stt.py — never invented
# here. Thresholds below are the commonly-cited Whisper conventions for "this transcript may be
# unreliable", not something this codebase measured itself.
LOW_CONFIDENCE_AVG_LOGPROB = -1.0
HIGH_NO_SPEECH_PROB = 0.5


def assess_transcription_quality(
    avg_logprob: float | None, avg_no_speech_prob: float | None
) -> str | None:
    """None whenever either signal is missing — this never fabricates a confidence value; if
    Groq didn't return segment data, there's simply nothing to warn about."""
    if avg_logprob is not None and avg_logprob < LOW_CONFIDENCE_AVG_LOGPROB:
        return "This transcription may be unreliable — the audio was hard to make out clearly."
    if avg_no_speech_prob is not None and avg_no_speech_prob > HIGH_NO_SPEECH_PROB:
        return (
            "This transcription may be unreliable — much of the recording sounded like "
            "silence or background noise."
        )
    return None
