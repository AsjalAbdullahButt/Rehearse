"""Panel interviews: a simulated recruiter, technical lead and engineering manager.

The panelists are not just names. Each *owns* a set of competencies: when a panelist's turn
comes up, the adaptive engine may only pick a competency from that panelist's remit, so a
recruiter never asks about caching and the technical lead never asks about career motivation.
A follow-up on the previous answer stays with whoever asked it, and each answer's score is
attributed to its panelist for the per-panelist assessment in the report.

These are simulated interviewers (fictional first names) — they say so in the UI."""

from collections.abc import Collection
from dataclasses import dataclass

from app.models.enums import Category
from app.services.competency import competency_category


@dataclass(frozen=True)
class Panelist:
    key: str
    name: str
    title: str
    # Appended to the question-writing prompt so the voice matches the remit.
    instruction: str


RECRUITER = Panelist(
    "recruiter",
    "Sam",
    "Recruiter",
    "You are Sam, a recruiter. You care about communication, motivation, teamwork, conflict, "
    "career goals and leadership. Stay out of deep technical detail.",
)
TECH_LEAD = Panelist(
    "tech_lead",
    "Alex",
    "Technical Lead",
    "You are Alex, a technical lead. You care about technical depth, implementation, "
    "architecture, debugging and tradeoffs.",
)
MANAGER = Panelist(
    "manager",
    "Jordan",
    "Engineering Manager",
    "You are Jordan, an engineering manager. You care about ownership, decision making, "
    "prioritisation, scalability and business reasoning.",
)

PANEL: tuple[Panelist, ...] = (RECRUITER, TECH_LEAD, MANAGER)
_BY_KEY = {p.key: p for p in PANEL}

_RECRUITER_OWNS = frozenset(
    {
        "communication",
        "teamwork",
        "conflict",
        "motivation",
        "leadership",
        "adaptability",
        "failure",
        "people-management",
    }
)
_MANAGER_OWNS = frozenset(
    {
        "ownership",
        "decision-making",
        "prioritization",
        "problem-solving",
        "stakeholder-management",
        "product-sense",
        "system-design",
    }
)


def panelist_by_key(key: str | None) -> Panelist | None:
    return _BY_KEY.get(key) if key else None


def owner_of(competency: str) -> Panelist:
    """Who is responsible for a competency. Anything unclaimed (including custom-role skills,
    which are technical by default) belongs to the technical lead — except unclaimed behavioral
    or situational ones, which go to the recruiter and manager respectively."""
    if competency in _RECRUITER_OWNS:
        return RECRUITER
    if competency in _MANAGER_OWNS:
        return MANAGER
    category = competency_category(competency)
    if category == Category.BEHAVIORAL:
        return RECRUITER
    if category == Category.SITUATIONAL:
        return MANAGER
    return TECH_LEAD


def allowed_competencies(panelist: Panelist, plan_competencies: Collection[str]) -> frozenset[str]:
    return frozenset(c for c in plan_competencies if owner_of(c) == panelist)


def choose_panelist(
    turn_index: int, plan_competencies: Collection[str]
) -> tuple[Panelist, frozenset[str]]:
    """Round-robin by turn, skipping any panelist with nothing in this plan to ask about (e.g. no
    technical competencies for an HR role). `turn_index` is the 0-based number of questions
    already asked. Falls back to the recruiter with the whole plan if nobody owns anything."""
    for offset in range(len(PANEL)):
        candidate = PANEL[(turn_index + offset) % len(PANEL)]
        allowed = allowed_competencies(candidate, plan_competencies)
        if allowed:
            return candidate, allowed
    return RECRUITER, frozenset(plan_competencies)


def assessment_label(panelist_key: str) -> str:
    panelist = _BY_KEY.get(panelist_key)
    return f"{panelist.title} assessment" if panelist else "Assessment"
