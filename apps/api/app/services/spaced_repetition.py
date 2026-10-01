"""A deliberately simple, transparent review schedule over the candidate's competency mastery.

The rule: the weaker a skill, the sooner it is due again. Interval by mastery band (days):
below 40% -> 1, below 60% -> 2, below 75% -> 4, below 90% -> 7, otherwise 14. If more than half
of the attempts at a skill were unsuccessful the interval is halved (min 1 day). A skill is due
once `last_practiced_at + interval` has passed. Mastered skills are never dropped — they simply
come back every two weeks for review.

Pure functions, no database."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.services.competency import competency_name

_BANDS: tuple[tuple[float, int], ...] = ((0.4, 1), (0.6, 2), (0.75, 4), (0.9, 7))
MASTERED_INTERVAL_DAYS = 14
MAX_TODAY = 3
QUESTIONS_PER_SESSION = 3
MINUTES_PER_QUESTION = 3


@dataclass(frozen=True)
class SkillState:
    competency: str
    mastery: float
    attempts: int
    successful_attempts: int
    last_practiced_at: datetime | None


@dataclass(frozen=True)
class ScheduledSkill:
    competency: str
    name: str
    mastery: float
    interval_days: int
    due_at: datetime
    days_until_due: int  # <= 0 means due now (negative = overdue)
    is_due: bool


@dataclass(frozen=True)
class PracticePlan:
    today: list[ScheduledSkill]
    upcoming: list[ScheduledSkill]
    question_count: int
    estimated_minutes: int


def interval_days(mastery: float, attempts: int, successful_attempts: int) -> int:
    base = MASTERED_INTERVAL_DAYS
    for ceiling, days in _BANDS:
        if mastery < ceiling:
            base = days
            break
    failures = attempts - successful_attempts
    if attempts and failures / attempts > 0.5:
        base = max(1, base // 2)
    return base


def _schedule(skill: SkillState, now: datetime) -> ScheduledSkill:
    interval = interval_days(skill.mastery, skill.attempts, skill.successful_attempts)
    # No recorded practice date means it can't be scheduled from evidence; treat it as due now.
    due_at = (skill.last_practiced_at or now) + timedelta(days=interval)
    # Floor division on the delta so "due in 23h" is 0 days (today), not 1.
    days_until_due = (due_at - now).days if due_at > now else -((now - due_at).days)
    return ScheduledSkill(
        competency=skill.competency,
        name=competency_name(skill.competency),
        mastery=skill.mastery,
        interval_days=interval,
        due_at=due_at,
        days_until_due=days_until_due,
        is_due=due_at <= now,
    )


def build_plan(skills: list[SkillState], now: datetime) -> PracticePlan:
    scheduled = [_schedule(s, now) for s in skills if s.attempts > 0]
    due = sorted(
        (s for s in scheduled if s.is_due),
        # Most overdue first, weaker skills breaking ties; name keeps it deterministic.
        key=lambda s: (s.days_until_due, s.mastery, s.competency),
    )
    upcoming = sorted(
        (s for s in scheduled if not s.is_due), key=lambda s: (s.due_at, s.competency)
    )
    today = due[:MAX_TODAY]
    return PracticePlan(
        today=today,
        upcoming=upcoming + due[MAX_TODAY:],
        question_count=QUESTIONS_PER_SESSION if today else 0,
        estimated_minutes=QUESTIONS_PER_SESSION * MINUTES_PER_QUESTION if today else 0,
    )
