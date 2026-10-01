"""What an interviewer style actually *does*. A style is not just prompt flavour: the fields here
feed the deterministic question-selection logic (app/services/adaptive_engine.py) as well as the
tone paragraph handed to the LLM, so "challenging" changes which question comes next, not only how
it's worded.

Only fields something currently consumes are listed — no speculative knobs."""

from dataclasses import dataclass

from app.models.enums import InterviewerStyle


@dataclass(frozen=True)
class InterviewerPolicy:
    style: InterviewerStyle
    # Added to the session's baseline difficulty level (1-5) for the opening question.
    start_level_offset: int
    # How far the target level moves after a strong / weak answer.
    strong_step: int
    weak_step: int
    # How many times one competency may be probed deeper in a single session before moving on.
    max_depth_probes: int
    # Answers scoring below this (0-10) are treated as weak; at/above `strong_threshold`, strong.
    weak_threshold: float
    strong_threshold: float
    # 0-1: how readily a vague/average answer triggers a follow-up on the same competency
    # instead of moving to fresh coverage.
    follow_up_aggressiveness: float
    # 0-1: how much a claim extracted from an answer outranks plain competency coverage.
    claim_challenge_level: float
    # "none" | "light" | "full" — whether the UI may offer hints / nudges during an answer.
    hint_level: str
    # "after_each" | "end_only" — when feedback is surfaced to the candidate.
    feedback_frequency: str
    tone_instruction: str


_POLICIES: dict[InterviewerStyle, InterviewerPolicy] = {
    InterviewerStyle.SUPPORTIVE: InterviewerPolicy(
        style=InterviewerStyle.SUPPORTIVE,
        start_level_offset=-1,
        strong_step=1,
        weak_step=-1,
        max_depth_probes=1,
        weak_threshold=5.0,
        strong_threshold=8.0,
        follow_up_aggressiveness=0.3,
        claim_challenge_level=0.3,
        hint_level="light",
        feedback_frequency="after_each",
        tone_instruction=(
            "You are a warm, encouraging interview coach. Be direct and honest about what to "
            "improve, never harsh, and anchor feedback in something specific the candidate did "
            "well before moving on to what's next."
        ),
    ),
    InterviewerStyle.REALISTIC: InterviewerPolicy(
        style=InterviewerStyle.REALISTIC,
        start_level_offset=0,
        strong_step=1,
        weak_step=-1,
        max_depth_probes=2,
        weak_threshold=5.0,
        strong_threshold=7.5,
        follow_up_aggressiveness=0.6,
        claim_challenge_level=0.6,
        hint_level="none",
        feedback_frequency="end_only",
        tone_instruction=(
            "You are a neutral, professional interviewer. Do not coach or reassure; assess the "
            "answer the way a hiring panel would, concisely and without softening real gaps."
        ),
    ),
    InterviewerStyle.CHALLENGING: InterviewerPolicy(
        style=InterviewerStyle.CHALLENGING,
        start_level_offset=1,
        strong_step=2,
        weak_step=0,
        max_depth_probes=3,
        weak_threshold=5.5,
        strong_threshold=7.0,
        follow_up_aggressiveness=0.9,
        claim_challenge_level=0.9,
        hint_level="none",
        feedback_frequency="end_only",
        tone_instruction=(
            "You are a demanding senior interviewer. Treat vague answers as unproven: look for "
            "missing evidence, unexamined tradeoffs, untested assumptions and superficial "
            "knowledge, and say so plainly. Stay professional — rigorous, not rude."
        ),
    ),
}


def policy_for(style: InterviewerStyle | None) -> InterviewerPolicy:
    """No style chosen behaves as the realistic default."""
    return _POLICIES[style or InterviewerStyle.REALISTIC]
