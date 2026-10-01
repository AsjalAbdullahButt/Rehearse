"""Competency taxonomy, normalization, and the mastery-score math.

Why a taxonomy: the LLM (job-description analysis, question generation) would otherwise invent a
slightly different name every session ("API security", "REST security", "Web API security"), which
makes persistent mastery tracking meaningless. Every competency name that enters the system goes
through `normalize_competency`, which maps it onto a canonical key — or, only when nothing matches,
onto a bounded slug so a genuinely novel skill from a custom role is still tracked under one
stable key.

Mastery/evidence scores here are 0-1; callers convert from the 0-10 rubric scale."""

import re
from dataclasses import dataclass

from app.models.enums import Category


@dataclass(frozen=True)
class CompetencyDef:
    key: str
    name: str
    category: Category
    keywords: tuple[str, ...]


_B, _T, _S = Category.BEHAVIORAL, Category.TECHNICAL, Category.SITUATIONAL

CANONICAL_COMPETENCIES: tuple[CompetencyDef, ...] = (
    # behavioral
    CompetencyDef("communication", "Communication", _B, ("communicat", "explain")),
    CompetencyDef("conflict", "Conflict Resolution", _B, ("conflict", "disagree", "difficult")),
    CompetencyDef("teamwork", "Teamwork", _B, ("teamwork", "collaborat", "teammate")),
    CompetencyDef("leadership", "Leadership", _B, ("leadership", "mentor", "managing")),
    CompetencyDef("ownership", "Ownership", _B, ("ownership", "accountab", "proud", "initiative")),
    CompetencyDef("adaptability", "Adaptability", _B, ("adapt", "ambigu", "learn")),
    CompetencyDef("motivation", "Motivation", _B, ("motivat", "career", "yourself")),
    CompetencyDef("failure", "Learning from Failure", _B, ("failure", "mistake", "bad news")),
    CompetencyDef("people-management", "People Management", _B, ("hiring", "performance review")),
    # situational
    CompetencyDef("prioritization", "Prioritization", _S, ("prioriti", "deadline")),
    CompetencyDef("decision-making", "Decision Making", _S, ("decision", "judg", "would you do")),
    CompetencyDef("problem-solving", "Problem Solving", _S, ("problem solving", "investigat")),
    CompetencyDef("stakeholder-management", "Stakeholder Management", _S, ("stakeholder",)),
    CompetencyDef("product-sense", "Product Sense", _S, ("product", "roadmap", "user need")),
    CompetencyDef("user-research", "User Research", _S, ("user research", "usability")),
    # technical — general engineering
    CompetencyDef("api-design", "API Design", _T, ("api design", "rest", "graphql", "endpoint")),
    CompetencyDef("sql", "SQL & Databases", _T, ("sql", "database", "index", "query", "schema")),
    CompetencyDef("caching", "Caching", _T, ("cach", "redis", "memcache", "invalidat")),
    CompetencyDef("system-design", "System Design", _T, ("system design", "design a", "scal")),
    CompetencyDef("concurrency", "Concurrency", _T, ("concurren", "thread", "async", "race")),
    CompetencyDef("testing", "Testing", _T, ("test", "tdd", "coverage")),
    CompetencyDef("security", "Security", _T, ("security", "authenticat", "authoriz", "xss")),
    CompetencyDef("debugging", "Debugging", _T, ("debug", "incorrect results", "root cause")),
    CompetencyDef("algorithms", "Algorithms & Data Structures", _T, ("algorithm", "complexity")),
    CompetencyDef("devops", "DevOps & CI/CD", _T, ("devops", "ci/cd", "docker", "kubernetes")),
    CompetencyDef("cloud", "Cloud Infrastructure", _T, ("aws", "cloud", "azure", "gcp")),
    CompetencyDef("distributed-systems", "Distributed Systems", _T, ("distributed", "consisten")),
    CompetencyDef("performance", "Performance", _T, ("performance", "latency", "optimi")),
    CompetencyDef("architecture", "Software Architecture", _T, ("architect", "microservice")),
    # technical — frontend
    CompetencyDef("frontend-fundamentals", "Frontend Fundamentals", _T, ("html", "css", "dom")),
    CompetencyDef("javascript", "JavaScript & TypeScript", _T, ("javascript", "typescript")),
    CompetencyDef("react", "React & UI Frameworks", _T, ("react", "component", "state manag")),
    CompetencyDef("accessibility", "Accessibility", _T, ("accessib", "a11y", "aria")),
    # technical — data / ML / design
    CompetencyDef("statistics", "Statistics", _T, ("statistic", "hypothesis", "probabil")),
    CompetencyDef("machine-learning", "Machine Learning", _T, ("machine learning", "model ")),
    CompetencyDef("data-engineering", "Data Engineering", _T, ("pipeline", "etl", "warehouse")),
    CompetencyDef("data-analysis", "Data Analysis", _T, ("analys", "dashboard", "metric")),
    CompetencyDef("design-craft", "Design Craft", _T, ("design system", "visual", "interaction")),
)

_BY_KEY = {c.key: c for c in CANONICAL_COMPETENCIES}

_ALIASES: dict[str, str] = {
    "api security": "security",
    "rest security": "security",
    "web api security": "security",
    "authentication": "security",
    "auth": "security",
    "databases": "sql",
    "database": "sql",
    "postgres": "sql",
    "postgresql": "sql",
    "mysql": "sql",
    "rest": "api-design",
    "rest api": "api-design",
    "apis": "api-design",
    "microservices": "architecture",
    "ci/cd": "devops",
    "docker": "devops",
    "aws": "cloud",
    "redis": "caching",
    "ml": "machine-learning",
    "dsa": "algorithms",
    "data structures": "algorithms",
    "soft skills": "communication",
}

MAX_CUSTOM_KEY_LENGTH = 48
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    return _SLUG_RE.sub("-", text.lower()).strip("-")[:MAX_CUSTOM_KEY_LENGTH]


def normalize_competency(name: str) -> str:
    """Maps free text onto a canonical competency key; a name that matches nothing becomes a
    bounded slug (so a niche custom-role skill is still tracked under one stable key)."""
    cleaned = name.strip().lower()
    if cleaned in _BY_KEY:
        return cleaned
    if cleaned in _ALIASES:
        return _ALIASES[cleaned]
    slug = slugify(cleaned)
    if slug in _BY_KEY:
        return slug
    for def_ in CANONICAL_COMPETENCIES:
        if def_.name.lower() == cleaned:
            return def_.key
    return slug or "general"


def competency_name(key: str) -> str:
    known = _BY_KEY.get(key)
    return known.name if known else key.replace("-", " ").title()


def competency_category(key: str) -> Category:
    """Home category for a competency; unknown/custom keys are treated as technical, the only
    category where a niche professional skill makes sense."""
    known = _BY_KEY.get(key)
    return known.category if known else Category.TECHNICAL


# Hand-tagged competencies for the original seed bank questions whose wording keyword
# inference can't classify. Matched case-insensitively as a prefix of the question text.
BANK_COMPETENCY_OVERRIDES: tuple[tuple[str, str], ...] = (
    ("a teammate keeps submitting code without tests", "testing"),
    ("describe a time you had to push back on a design", "stakeholder-management"),
    ("tell me about a time you improved the performance of a web", "performance"),
    ("explain how the browser's critical rendering path", "performance"),
    ("your team wants to adopt a new frontend framework", "decision-making"),
    ("tell me about a backend system you designed", "system-design"),
    ("describe a time a service you owned went down", "ownership"),
    ("tell me about a time you improved an api's reliability", "performance"),
    ("your service's error rate spikes", "debugging"),
    ("two microservices are tightly coupled", "architecture"),
    ("you need to migrate a critical service", "system-design"),
    ("tell me about a data project where your analysis changed", "data-analysis"),
    ("describe a time your analysis was wrong", "failure"),
    ("how do you handle missing data", "data-analysis"),
    ("how would you detect and handle data drift", "machine-learning"),
    ("you find that a dataset used for a live model", "data-engineering"),
    ("your analysis contradicts what leadership", "stakeholder-management"),
    ("tell me about an ml model you took from prototype", "machine-learning"),
    ("describe a time a model you deployed underperformed", "failure"),
    ("tell me about a time you had to balance model accuracy", "performance"),
    ("what's the difference between batch and online inference", "machine-learning"),
    ("your training pipeline is slow", "data-engineering"),
    ("describe a time you had to say no to a stakeholder", "stakeholder-management"),
    ("tell me about a time you used data to change the direction", "product-sense"),
    ("how do you prioritize a backlog", "prioritization"),
    ("how would you approach writing a prd", "product-sense"),
    ("how would you decide whether to build, buy", "decision-making"),
    ("engineering says a requested feature will take twice", "prioritization"),
    ("user feedback and internal data are pointing", "decision-making"),
    ("walk me through a design project from research", "design-craft"),
    ("describe a time user research changed", "user-research"),
    ("describe a time you received harsh critique", "adaptability"),
    ("why are you interested in this role", "motivation"),
    ("tell me about a time you had to manage multiple priorities", "prioritization"),
    ("where do you see yourself in five years", "motivation"),
    ("what's your greatest strength", "communication"),
    ("what's your greatest weakness", "adaptability"),
    ("how do you handle disagreements with your manager", "conflict"),
    ("why should we hire you", "motivation"),
)


def infer_competency(text: str, category: Category) -> str | None:
    """Best-effort tag for a question that has no stored competency (every pre-taxonomy bank
    row): the first canonical competency of the same category whose keyword appears in the text.
    Returns None rather than guessing when nothing matches."""
    stripped = text.strip().lower()
    for prefix, key in BANK_COMPETENCY_OVERRIDES:
        if stripped.startswith(prefix):
            return key
    lowered = f" {stripped} "
    for def_ in CANONICAL_COMPETENCIES:
        if def_.category != category:
            continue
        if any(keyword in lowered for keyword in def_.keywords):
            return def_.key
    return None


# ─── mastery math ────────────────────────────────────────────────────────

MIN_LEVEL = 1
MAX_LEVEL = 5
_STEADY_ALPHA = 0.35


def clamp_level(level: int) -> int:
    return max(MIN_LEVEL, min(MAX_LEVEL, level))


def evidence_score(score_0_to_10: float, level: int) -> float:
    """A 0-1 evidence value for one answer. Success on an easy question says less about mastery
    than success on a hard one, so the raw score is nudged by difficulty (level 3 is neutral)."""
    normalized = max(0.0, min(10.0, score_0_to_10)) / 10.0
    return max(0.0, min(1.0, normalized * (0.85 + 0.05 * (level - 1))))


def confidence_for(attempts: int) -> float:
    """Confidence grows with evidence: 0 attempts -> 0, asymptotically approaching 1."""
    return round(1 - 0.7**attempts, 4) if attempts > 0 else 0.0


def update_mastery(old_mastery: float, attempts: int, evidence: float) -> tuple[float, float]:
    """Returns (new_mastery, new_confidence). The first few attempts form a running average, so
    one early answer never anchors the score; after that a fixed recency weight keeps it
    responsive without a single outlier swinging it ("don't overreact to one answer")."""
    alpha = max(_STEADY_ALPHA, 1.0 / (attempts + 1))
    new_mastery = old_mastery * (1 - alpha) + evidence * alpha
    return round(new_mastery, 4), confidence_for(attempts + 1)
