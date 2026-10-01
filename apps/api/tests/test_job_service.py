import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import Role
from app.schemas.planning import AnalyzedCompetency, JobAnalysis
from app.services import job_service, llm, repo
from app.services.job_service import (
    bank_role_for,
    clean_role_title,
    default_plan,
    plan_from_analysis,
    preset_role,
    role_key_for_title,
)


def test_role_key_for_title_is_stable_and_unicode_safe() -> None:
    assert role_key_for_title("AI Automation Engineer") == "ai-automation-engineer"
    assert role_key_for_title("Backend") == "backend"
    assert role_key_for_title("Software Engineer") == "software-engineer"
    assert role_key_for_title("مهندس ذكاء اصطناعي") != ""
    assert role_key_for_title("日本語") != ""


def test_typing_a_preset_name_resolves_to_the_preset() -> None:
    assert preset_role(role_key_for_title("Product Manager")) == Role.PRODUCT_MANAGER
    assert preset_role(role_key_for_title("Cloud Engineer")) is None


def test_custom_roles_borrow_the_general_bank() -> None:
    assert bank_role_for("backend") == Role.BACKEND
    assert bank_role_for("devops-engineer") == Role.HR_GENERAL


@pytest.mark.parametrize("bad", ["", "   ", "role\x00name", "role\nname<script>", "a" * 0])
def test_clean_role_title_rejects_junk(bad: str) -> None:
    with pytest.raises(ValueError):
        clean_role_title(bad)


def test_clean_role_title_collapses_whitespace() -> None:
    assert clean_role_title("  Data   Engineer ") == "Data Engineer"


def test_every_preset_has_a_normalised_default_plan() -> None:
    for role in Role:
        plan = default_plan(role.value)
        assert sum(item.weight for item in plan) == pytest.approx(1.0)
    assert sum(item.weight for item in default_plan("anything-custom")) == pytest.approx(1.0)


def test_plan_from_analysis_merges_aliases_and_normalises_weights() -> None:
    analysis = JobAnalysis(
        seniority="senior",
        competencies=[
            AnalyzedCompetency(name="API security", weight=20, resume_evidence="strong"),
            AnalyzedCompetency(name="REST security", weight=10, importance="preferred"),
            AnalyzedCompetency(name="PostgreSQL", weight=30, resume_evidence="missing"),
            AnalyzedCompetency(name="Communication", weight=40),
        ],
    )
    plan = {item.competency: item for item in plan_from_analysis(analysis)}

    assert set(plan) == {"security", "sql", "communication"}
    assert plan["security"].weight == pytest.approx(0.3)
    assert plan["security"].importance == "required"
    assert plan["sql"].resume_evidence == "missing"
    assert sum(item.weight for item in plan.values()) == pytest.approx(1.0)


def test_plan_is_capped_to_the_heaviest_entries() -> None:
    analysis = JobAnalysis(
        competencies=[AnalyzedCompetency(name=f"skill {i}", weight=i + 1) for i in range(12)]
    )
    plan = plan_from_analysis(analysis)
    assert len(plan) == job_service.MAX_PLAN_SIZE
    assert "skill-0" not in {item.competency for item in plan}


async def _register(db: AsyncSession, email: str) -> str:
    user = await repo.create_user(db, email=email, password_hash="x")
    return user.id


async def test_resolve_skips_analysis_for_a_preset_role_without_a_jd(
    db_session: AsyncSession,
) -> None:
    user_id = await _register(db_session, "a@example.com")
    target = await job_service.resolve_job_target(
        db_session,
        user_id=user_id,
        role_key="backend",
        role_title="backend",
        company=None,
        job_description=None,
        candidate_background=None,
    )
    assert target is None


async def test_resolve_analyses_once_then_reuses_the_cached_target(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = 0

    async def fake_analyze(**kwargs: object) -> JobAnalysis:
        nonlocal calls
        calls += 1
        return JobAnalysis(
            seniority="senior",
            competencies=[
                AnalyzedCompetency(name="Redis", weight=50, resume_evidence="missing"),
                AnalyzedCompetency(name="Python", weight=50),
            ],
        )

    monkeypatch.setattr(llm, "analyze_job_target", fake_analyze)
    user_id = await _register(db_session, "a@example.com")
    kwargs = {
        "user_id": user_id,
        "role_key": "backend",
        "role_title": "Backend",
        "company": None,
        "job_description": "We need Redis and Python.",
        "candidate_background": "Wrote Python.",
    }

    first = await job_service.resolve_job_target(db_session, **kwargs)  # type: ignore[arg-type]
    second = await job_service.resolve_job_target(db_session, **kwargs)  # type: ignore[arg-type]

    assert first is not None and second is not None
    assert first.id == second.id
    assert calls == 1
    assert first.seniority == "senior"
    assert first.analysis_source == "llm"

    plan = await job_service.plan_for_session(
        db_session, role="backend", job_target_id=first.id, user_id=user_id
    )
    by_name = {item.competency: item for item in plan}
    assert by_name["caching"].resume_evidence == "missing"


async def test_different_jds_produce_different_plans(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_analyze(*, job_description: str | None, **kwargs: object) -> JobAnalysis:
        name = "Redis" if job_description and "Redis" in job_description else "Terraform"
        return JobAnalysis(competencies=[AnalyzedCompetency(name=name, weight=1)])

    monkeypatch.setattr(llm, "analyze_job_target", fake_analyze)
    user_id = await _register(db_session, "a@example.com")

    async def plan_for(jd: str) -> set[str]:
        target = await job_service.resolve_job_target(
            db_session,
            user_id=user_id,
            role_key="backend",
            role_title="Backend",
            company=None,
            job_description=jd,
            candidate_background=None,
        )
        assert target is not None
        plan = await job_service.plan_for_session(
            db_session, role="backend", job_target_id=target.id, user_id=user_id
        )
        return {item.competency for item in plan}

    assert await plan_for("Needs Redis") != await plan_for("Needs infrastructure as code")


async def test_resolve_falls_back_to_the_default_plan_when_the_llm_fails(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def failing(**kwargs: object) -> JobAnalysis:
        raise ApiError("llm_failed", "down", status_code=502)

    monkeypatch.setattr(llm, "analyze_job_target", failing)
    user_id = await _register(db_session, "a@example.com")

    target = await job_service.resolve_job_target(
        db_session,
        user_id=user_id,
        role_key="cloud-engineer",
        role_title="Cloud Engineer",
        company=None,
        job_description=None,
        candidate_background=None,
    )

    assert target is not None
    assert target.analysis_source == "default"
    plan = await job_service.plan_for_session(
        db_session, role="cloud-engineer", job_target_id=target.id, user_id=user_id
    )
    assert plan  # the interview still has something to plan from


async def test_competency_maps_are_only_readable_by_their_owner(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_analyze(**kwargs: object) -> JobAnalysis:
        return JobAnalysis(competencies=[AnalyzedCompetency(name="Redis", weight=1)])

    monkeypatch.setattr(llm, "analyze_job_target", fake_analyze)
    owner = await _register(db_session, "owner@example.com")
    other = await _register(db_session, "other@example.com")
    target = await job_service.resolve_job_target(
        db_session,
        user_id=owner,
        role_key="backend",
        role_title="Backend",
        company=None,
        job_description="Redis",
        candidate_background=None,
    )
    assert target is not None

    assert await repo.list_job_competencies(db_session, job_target_id=target.id, user_id=owner)
    assert not await repo.list_job_competencies(db_session, job_target_id=target.id, user_id=other)
