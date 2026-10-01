"""The Rehearse Readiness Score — an explainable 0-100 estimate of how prepared the candidate is
for a role's competency plan, built only from their own recorded answers.

Method: for every competency in the plan, take the mastery estimate but shrink it toward a neutral
50% in proportion to how little evidence there is (confidence), so one lucky answer cannot read as
readiness. The score is the plan-weighted average over the competencies that have been assessed.
If too little of the plan has been assessed, no score is produced at all rather than a misleading
one. There is no population benchmark and none is implied."""

from dataclasses import dataclass

from app.models.enums import Category
from app.schemas.readiness import CategoryReadiness, ReadinessDriver, ReadinessOut
from app.services.adaptive_engine import PlanItem
from app.services.competency import competency_category, competency_name

NEUTRAL = 0.5
# Below either threshold we say "not enough evidence" instead of showing a number.
MIN_COVERAGE = 0.3
MIN_TOTAL_ATTEMPTS = 3


@dataclass(frozen=True)
class Evidence:
    mastery: float
    confidence: float
    attempts: int


def _effective(evidence: Evidence) -> float:
    return evidence.mastery * evidence.confidence + NEUTRAL * (1 - evidence.confidence)


def compute_readiness(
    plan: list[PlanItem], evidence: dict[str, Evidence], *, role: str
) -> ReadinessOut:
    drivers: list[ReadinessDriver] = []
    assessed_weight = 0.0
    weighted_sum = 0.0
    total_attempts = 0
    by_category: dict[Category, list[tuple[float, float]]] = {}

    for item in plan:
        ev = evidence.get(item.competency)
        assessed = ev is not None and ev.attempts > 0
        effective = _effective(ev) if ev is not None and assessed else None
        if assessed and ev is not None and effective is not None:
            assessed_weight += item.weight
            weighted_sum += item.weight * effective
            total_attempts += ev.attempts
            by_category.setdefault(competency_category(item.competency), []).append(
                (item.weight, effective)
            )
        drivers.append(
            ReadinessDriver(
                competency=item.competency,
                name=competency_name(item.competency),
                weight=round(item.weight, 4),
                mastery=round(ev.mastery * 100) if assessed and ev is not None else None,
                confidence=round(ev.confidence * 100) if assessed and ev is not None else None,
                attempts=ev.attempts if ev is not None else 0,
                assessed=assessed,
                resume_evidence=item.resume_evidence,
            )
        )

    coverage = round(assessed_weight, 4)
    enough = coverage >= MIN_COVERAGE and total_attempts >= MIN_TOTAL_ATTEMPTS
    score = round(100 * weighted_sum / assessed_weight) if enough and assessed_weight else None

    categories = [
        CategoryReadiness(
            category=category,
            score=round(100 * sum(w * v for w, v in pairs) / sum(w for w, _ in pairs)),
        )
        for category, pairs in sorted(by_category.items(), key=lambda kv: kv[0].value)
    ]

    assessed_drivers = [d for d in drivers if d.assessed and d.mastery is not None]
    strongest = max(assessed_drivers, key=lambda d: (d.mastery or 0, d.competency), default=None)

    # Biggest hiring risk: the competency with the largest weight x shortfall, counting an
    # unassessed one at the neutral prior so a heavily weighted blind spot surfaces too.
    def _risk(d: ReadinessDriver) -> float:
        value = (d.mastery / 100) if d.mastery is not None else NEUTRAL
        return d.weight * (1 - value)

    risk = max(drivers, key=lambda d: (_risk(d), d.competency), default=None)

    explanation: list[str] = []
    if score is None:
        explanation.append(
            "Not enough practice yet to estimate readiness for this role. Answer a few more "
            "questions across its key skills."
        )
    else:
        explanation.append(
            f"Based on {total_attempts} answers covering {round(coverage * 100)}% of this "
            "role's skill plan, weighted by how much the role needs each skill."
        )
        if coverage < 0.7:
            explanation.append("Some skills the role needs have not been assessed yet.")
    if risk is not None and score is not None:
        reason = "no evidence yet" if not risk.assessed else f"mastery {risk.mastery}%"
        explanation.append(f"Biggest gap: {risk.name} ({reason}).")

    return ReadinessOut(
        role=role,
        score=score,
        coverage=round(coverage * 100),
        total_attempts=total_attempts,
        categories=categories,
        strongest=strongest.competency if strongest else None,
        main_risk=risk.competency if risk and score is not None else None,
        drivers=drivers,
        explanation=explanation,
    )
