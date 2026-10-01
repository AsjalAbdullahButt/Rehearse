"""Role identity and the competency plan an interview is built from.

A plan comes from, in order of preference:
1. an LLM analysis of the job description (and resume background) — cached on a `JobTarget` so
   the same inputs never cost a second call;
2. an LLM inference from the role title alone, for custom roles with no JD;
3. a static default plan for the preset role (or a generic one), used for every preset role
   without a JD and as the fallback whenever the LLM is unavailable or returns something invalid.

The interview never fails because analysis did: step 3 is always available."""

import hashlib
import logging
import re
import unicodedata
from dataclasses import replace

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Role
from app.models.job_target import JobCompetency, JobTarget
from app.schemas.planning import JobAnalysis
from app.services import llm, repo
from app.services.adaptive_engine import PlanItem
from app.services.competency import normalize_competency

logger = logging.getLogger("rehearse.api")

MAX_PLAN_SIZE = 10

_GENERIC_PLAN: dict[str, float] = {
    "communication": 3,
    "problem-solving": 3,
    "teamwork": 2,
    "ownership": 2,
    "adaptability": 1,
    "decision-making": 2,
    "prioritization": 1,
}

DEFAULT_ROLE_PLANS: dict[Role, dict[str, float]] = {
    Role.SOFTWARE_ENGINEER: {
        "algorithms": 3,
        "system-design": 2,
        "debugging": 2,
        "testing": 1,
        "communication": 2,
        "teamwork": 1,
        "ownership": 1,
    },
    Role.FRONTEND: {
        "javascript": 3,
        "react": 3,
        "frontend-fundamentals": 2,
        "accessibility": 1,
        "performance": 1,
        "communication": 2,
        "teamwork": 1,
    },
    Role.BACKEND: {
        "api-design": 3,
        "sql": 3,
        "caching": 1,
        "system-design": 2,
        "security": 2,
        "concurrency": 1,
        "testing": 1,
        "communication": 2,
        "ownership": 1,
    },
    Role.DATA_SCIENTIST: {
        "statistics": 3,
        "machine-learning": 2,
        "data-analysis": 3,
        "sql": 1,
        "communication": 2,
        "problem-solving": 1,
    },
    Role.ML_ENGINEER: {
        "machine-learning": 3,
        "data-engineering": 2,
        "system-design": 2,
        "performance": 1,
        "testing": 1,
        "communication": 2,
        "ownership": 1,
    },
    Role.PRODUCT_MANAGER: {
        "product-sense": 3,
        "prioritization": 3,
        "stakeholder-management": 2,
        "decision-making": 2,
        "communication": 2,
        "leadership": 1,
    },
    Role.UI_UX_DESIGNER: {
        "design-craft": 3,
        "user-research": 3,
        "accessibility": 1,
        "communication": 2,
        "stakeholder-management": 1,
        "teamwork": 1,
    },
    Role.HR_GENERAL: {
        "communication": 3,
        "conflict": 2,
        "people-management": 2,
        "decision-making": 2,
        "teamwork": 1,
        "motivation": 1,
    },
}


def preset_role(role: str) -> Role | None:
    try:
        return Role(role)
    except ValueError:
        return None


def bank_role_for(role: str) -> Role:
    """The preset role whose question bank backs this role. A custom role has no bank of its own,
    so it borrows the role-agnostic HR/general bank and relies on generated questions for
    anything role-specific."""
    return preset_role(role) or Role.HR_GENERAL


_TITLE_ALLOWED = re.compile(r"^[\w\s\-/&+.#(),']+$", re.UNICODE)
_NON_WORD = re.compile(r"[^\w]+", re.UNICODE)


def clean_role_title(title: str) -> str:
    collapsed = " ".join(title.split())
    if not collapsed or any(unicodedata.category(ch).startswith("C") for ch in collapsed):
        raise ValueError("role must be plain text")
    if not _TITLE_ALLOWED.match(collapsed):
        raise ValueError("role contains unsupported characters")
    return collapsed


def role_key_for_title(title: str) -> str:
    """Stable, unicode-safe key for a custom role title. A title that slugs to a preset role's
    slug is that preset (so typing "Backend" never creates a parallel custom role)."""
    slug = _NON_WORD.sub("-", title.lower()).strip("-")[:64]
    if slug:
        return slug
    return "role-" + hashlib.sha256(title.encode()).hexdigest()[:12]


def _normalized_plan(raw: dict[str, float]) -> list[PlanItem]:
    total = sum(raw.values())
    return [
        PlanItem(competency=key, weight=value / total, importance="required")
        for key, value in sorted(raw.items())
    ]


def default_plan(role: str) -> list[PlanItem]:
    preset = preset_role(role)
    return _normalized_plan(DEFAULT_ROLE_PLANS[preset] if preset else _GENERIC_PLAN)


def plan_from_analysis(analysis: JobAnalysis) -> list[PlanItem]:
    """Normalises LLM competency names onto the taxonomy (merging duplicates the model produced
    under different names), keeps the heaviest MAX_PLAN_SIZE, and rescales weights to sum to 1."""
    merged: dict[str, tuple[float, str, str]] = {}
    for item in analysis.competencies:
        key = normalize_competency(item.name)
        weight, importance, evidence = merged.get(key, (0.0, "preferred", "unknown"))
        merged[key] = (
            weight + item.weight,
            "required" if "required" in (importance, item.importance) else "preferred",
            item.resume_evidence if evidence == "unknown" else evidence,
        )
    top = sorted(merged.items(), key=lambda kv: (-kv[1][0], kv[0]))[:MAX_PLAN_SIZE]
    total = sum(weight for _, (weight, _, _) in top)
    return [
        PlanItem(competency=key, weight=weight / total, importance=imp, resume_evidence=ev)
        for key, (weight, imp, ev) in top
    ]


def _analysis_hash(
    role_key: str, role_title: str, job_description: str | None, background: str | None
) -> str:
    material = "\x1f".join([role_key, role_title, job_description or "", (background or "")[:4000]])
    return hashlib.sha256(material.encode()).hexdigest()


def _plan_from_rows(rows: list[JobCompetency]) -> list[PlanItem]:
    return [
        PlanItem(
            competency=row.competency,
            weight=row.weight,
            importance=row.importance,
            resume_evidence=row.resume_evidence,
        )
        for row in rows
    ]


async def resolve_job_target(
    db: AsyncSession,
    *,
    user_id: str,
    role_key: str,
    role_title: str,
    company: str | None,
    job_description: str | None,
    candidate_background: str | None,
) -> JobTarget | None:
    """Returns the cached or freshly built JobTarget for a session that needs one (a JD was
    given, or the role is custom), else None — a preset role with no JD just uses its static
    default plan and has nothing worth persisting."""
    needs_analysis = bool(job_description) or preset_role(role_key) is None
    if not needs_analysis:
        return None

    digest = _analysis_hash(role_key, role_title, job_description, candidate_background)
    existing = await repo.get_job_target_by_hash(db, user_id=user_id, analysis_hash=digest)
    if existing is not None:
        return existing

    source = "llm"
    try:
        analysis = await llm.analyze_job_target(
            role_title=role_title,
            job_description=job_description,
            candidate_background=candidate_background,
        )
        plan = plan_from_analysis(analysis)
        seniority: str | None = None if analysis.seniority == "unknown" else analysis.seniority
    except Exception:
        # Deliberately broad: a timeout, rate limit, network error, invalid JSON or an unexpected
        # schema must all degrade to the default plan, never abort session creation. The failure
        # is logged without any of the (private) JD/resume text.
        logger.warning("job_analysis_failed role=%s falling_back_to_default_plan", role_key)
        plan = default_plan(role_key)
        seniority = None
        source = "default"

    target = JobTarget(
        user_id=user_id,
        role_title=role_title,
        company_name=company,
        job_description=job_description,
        seniority=seniority,
        analysis_hash=digest,
        analysis_source=source,
    )
    competencies = [
        JobCompetency(
            competency=item.competency,
            weight=item.weight,
            importance=item.importance,
            resume_evidence=item.resume_evidence,
            source="jd" if source == "llm" and job_description else "role_default",
        )
        for item in plan
    ]
    return await repo.create_job_target(db, target=target, competencies=competencies)


_FOCUS_TOPIC_BOOST = 2.0


def _boost_focus_topics(plan: list[PlanItem], focus_topics: list[str] | None) -> list[PlanItem]:
    """Candidate-chosen focus topics ("caching", "leadership") outweigh the plan's own priorities
    for those competencies, then weights are renormalised."""
    if not focus_topics:
        return plan
    wanted = {normalize_competency(topic) for topic in focus_topics}
    boosted = [
        replace(item, weight=item.weight * (_FOCUS_TOPIC_BOOST if item.competency in wanted else 1))
        for item in plan
    ]
    total = sum(item.weight for item in boosted)
    return [replace(item, weight=item.weight / total) for item in boosted]


async def plan_for_session(
    db: AsyncSession,
    *,
    role: str,
    job_target_id: str | None,
    user_id: str,
    focus_topics: list[str] | None = None,
) -> list[PlanItem]:
    """The competency plan for a session: its job target's analysed map when it has one."""
    plan: list[PlanItem] | None = None
    if job_target_id is not None:
        rows = await repo.list_job_competencies(db, job_target_id=job_target_id, user_id=user_id)
        if rows:
            plan = _plan_from_rows(rows)
    return _boost_focus_topics(plan or default_plan(role), focus_topics)
