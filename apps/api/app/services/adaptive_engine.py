"""The deterministic decision layer of the interviewer: *what* to ask next.

Pure functions only — no database, no LLM. The application decides the target competency, the
difficulty level and the mode (cover something new / probe deeper / step back to a diagnostic);
the LLM, when it's used at all, only phrases the question (see question_orchestrator.py). That
split keeps behaviour predictable, unit-testable and cheap, and means a provider outage can never
change *which* skill gets tested.

Levels follow the 1-5 scale in competency.py (1 foundation ... 5 expert)."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.models.enums import Category, Difficulty, Focus
from app.services.claims import ClaimView
from app.services.competency import (
    MAX_LEVEL,
    MIN_LEVEL,
    clamp_level,
    competency_category,
)
from app.services.interviewer_policy import InterviewerPolicy


class SelectionMode(StrEnum):
    COVERAGE = "coverage"  # a competency not yet tested this session
    DEEPEN = "deepen"  # same competency, harder — the last answer was strong
    DIAGNOSTIC = "diagnostic"  # same competency, simpler — the last answer was weak
    CLAIM_PROBE = "claim_probe"  # press on a substantive claim the candidate (or resume) made
    FALLBACK = "fallback"  # nothing better available (set by the orchestrator, not decide_next)


@dataclass(frozen=True)
class PlanItem:
    competency: str
    weight: float  # 0-1, plan weights sum to 1
    importance: str = "required"
    resume_evidence: str = "unknown"


@dataclass(frozen=True)
class MasteryStat:
    mastery: float  # 0-1
    confidence: float  # 0-1
    attempts: int


@dataclass(frozen=True)
class SessionTurn:
    """One question already served this session, with its score once answered (0-10)."""

    competency: str | None
    level: int | None
    category: Category
    mode: str | None
    score: float | None
    panelist: str | None = None


@dataclass(frozen=True)
class Decision:
    competency: str
    level: int
    mode: SelectionMode
    category: Category
    claim_id: str | None = None


_DIFFICULTY_BASE_LEVEL = {Difficulty.EASY: 2, Difficulty.MEDIUM: 3, Difficulty.HARD: 4}

# A competency tested once this session is multiplied by this per prior question, so it is
# revisited only deliberately (deepen/diagnostic), never by chance.
_COVERAGE_REPEAT_PENALTY = 0.15
_SAME_CATEGORY_AS_LAST_PENALTY = 0.8
_RESUME_GAP_BOOST = 1.3
_PRIOR_MASTERY = 0.5  # what we assume about a competency we have no evidence on


def level_for_difficulty(difficulty: Difficulty) -> int:
    return _DIFFICULTY_BASE_LEVEL[difficulty]


def base_level(difficulty: Difficulty, policy: InterviewerPolicy) -> int:
    return clamp_level(level_for_difficulty(difficulty) + policy.start_level_offset)


def next_level_after(previous_level: int, score: float, policy: InterviewerPolicy) -> int:
    """Strong answer -> harder (never past MAX_LEVEL); weak -> easier or held, per the style's
    weak_step (never below MIN_LEVEL); in between -> unchanged. Bounded in both directions so
    difficulty can never climb or collapse without limit."""
    if score >= policy.strong_threshold:
        return clamp_level(previous_level + policy.strong_step)
    if score < policy.weak_threshold:
        return clamp_level(previous_level + policy.weak_step)
    return clamp_level(previous_level)


def _depth_probes(history: Sequence[SessionTurn], competency: str) -> int:
    return sum(
        1
        for turn in history
        if turn.competency == competency
        and turn.mode in (SelectionMode.DEEPEN.value, SelectionMode.DIAGNOSTIC.value)
    )


def _follow_up_decision(
    history: Sequence[SessionTurn], policy: InterviewerPolicy
) -> Decision | None:
    """Probe the same competency again when the last answer warrants it and the style's depth
    budget for that competency isn't spent."""
    if not history:
        return None
    last = history[-1]
    if last.competency is None or last.score is None or last.level is None:
        return None
    if _depth_probes(history, last.competency) >= policy.max_depth_probes:
        return None

    category = competency_category(last.competency)
    if last.score >= policy.strong_threshold:
        if last.level >= MAX_LEVEL:
            return None  # already at the ceiling — move on rather than repeat the same depth
        level = next_level_after(last.level, last.score, policy)
        return Decision(last.competency, level, SelectionMode.DEEPEN, category)

    if last.score < policy.weak_threshold:
        level = next_level_after(last.level, last.score, policy)
        if level >= last.level and last.level <= MIN_LEVEL:
            return None  # nothing simpler exists to diagnose with
        return Decision(last.competency, level, SelectionMode.DIAGNOSTIC, category)

    # A middling answer: only the most demanding styles press on it ("why? what's the tradeoff?").
    if policy.follow_up_aggressiveness >= 0.8:
        return Decision(last.competency, last.level, SelectionMode.DEEPEN, category)
    return None


def _priority(
    item: PlanItem,
    mastery: Mapping[str, MasteryStat],
    history: Sequence[SessionTurn],
) -> float:
    stat = mastery.get(item.competency)
    if stat is None:
        believed, confidence = _PRIOR_MASTERY, 0.0
    else:
        confidence = stat.confidence
        believed = stat.mastery * confidence + _PRIOR_MASTERY * (1 - confidence)
    need = 1 - believed
    uncertainty = 1 - confidence
    priority = item.weight * (0.6 * need + 0.4 * uncertainty + 0.1)

    if item.resume_evidence in ("missing", "basic"):
        priority *= _RESUME_GAP_BOOST

    covered = sum(1 for turn in history if turn.competency == item.competency)
    priority *= _COVERAGE_REPEAT_PENALTY**covered

    if history and competency_category(item.competency) == history[-1].category:
        priority *= _SAME_CATEGORY_AS_LAST_PENALTY
    return priority


def _level_for_new_competency(
    competency: str,
    mastery: Mapping[str, MasteryStat],
    start_level: int,
) -> int:
    """New topic: blend the session's baseline with what we already know about the candidate's
    mastery of it, so a known-strong skill starts harder and a known-weak one starts easier."""
    stat = mastery.get(competency)
    if stat is None or stat.confidence < 0.3:
        return start_level
    mastery_level = 1 + stat.mastery * (MAX_LEVEL - 1)
    return clamp_level(round((start_level + mastery_level) / 2))


def decide_next(
    *,
    plan: Sequence[PlanItem],
    mastery: Mapping[str, MasteryStat],
    history: Sequence[SessionTurn],
    policy: InterviewerPolicy,
    focus: Focus,
    difficulty: Difficulty,
    claim: ClaimView | None = None,
    allowed: frozenset[str] | None = None,
) -> Decision:
    """Pick the next target. `history` is the session's questions so far, oldest first.

    `claim` (already vetted by claims.choose_claim) takes precedence over everything else: a
    probe of something the candidate said is the most natural next question. `allowed` limits a
    fresh coverage choice to one panelist's remit; follow-ups ignore it because they stay on the
    competency just asked about."""
    if claim is not None:
        last = history[-1] if history else None
        competency = claim.competency or (last.competency if last else None) or plan[0].competency
        level = (
            last.level
            if last is not None and last.level is not None
            else base_level(difficulty, policy)
        )
        return Decision(
            competency=competency,
            level=clamp_level(level),
            mode=SelectionMode.CLAIM_PROBE,
            category=competency_category(competency),
            claim_id=claim.id,
        )

    follow_up = _follow_up_decision(history, policy)
    if follow_up is not None and (focus == Focus.MIXED or follow_up.category.value == focus.value):
        return follow_up

    candidates = [
        item
        for item in plan
        if (focus == Focus.MIXED or competency_category(item.competency).value == focus.value)
        and (allowed is None or item.competency in allowed)
    ]
    if not candidates:
        # The plan has nothing for this focus (e.g. a purely technical plan, behavioral focus).
        # Fall back to the whole plan so the session still proceeds; the orchestrator keeps the
        # category the candidate asked for when it picks the actual question.
        candidates = list(plan)

    # max() over (priority, key) breaks ties alphabetically so the choice is fully deterministic.
    best = max(candidates, key=lambda item: (_priority(item, mastery, history), item.competency))
    start = base_level(difficulty, policy)
    return Decision(
        competency=best.competency,
        level=_level_for_new_competency(best.competency, mastery, start),
        mode=SelectionMode.COVERAGE,
        category=(
            Category(focus.value) if focus != Focus.MIXED else competency_category(best.competency)
        ),
    )
