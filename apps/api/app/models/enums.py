import enum


class Role(enum.StrEnum):
    SOFTWARE_ENGINEER = "software-engineer"
    FRONTEND = "frontend"
    BACKEND = "backend"
    DATA_SCIENTIST = "data-scientist"
    ML_ENGINEER = "ml-engineer"
    PRODUCT_MANAGER = "product-manager"
    UI_UX_DESIGNER = "ui-ux-designer"
    HR_GENERAL = "hr-general"


class Difficulty(enum.StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Category(enum.StrEnum):
    BEHAVIORAL = "behavioral"
    TECHNICAL = "technical"
    SITUATIONAL = "situational"


class ExperienceLevel(enum.StrEnum):
    STUDENT = "student"
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"


class Focus(enum.StrEnum):
    """A session-level setting, unlike Category (a per-question label) — MIXED has no Category
    counterpart, every other value shares its literal string with one so a non-mixed focus maps
    straight onto the matching category (Category(focus.value))."""

    BEHAVIORAL = "behavioral"
    TECHNICAL = "technical"
    SITUATIONAL = "situational"
    MIXED = "mixed"


class InterviewerStyle(enum.StrEnum):
    SUPPORTIVE = "supportive"
    REALISTIC = "realistic"
    CHALLENGING = "challenging"


class InterviewMode(enum.StrEnum):
    TECHNICAL_QA = "technical_qa"
    CODING = "coding"
    SYSTEM_DESIGN = "system_design"
    CASE_STUDY = "case_study"


class SessionStatus(enum.StrEnum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    # The candidate deliberately stopped before answering every question. Distinct from
    # COMPLETED so a report never claims a full interview that wasn't finished.
    ENDED_EARLY = "ended_early"


# Terminal states have no outgoing edge, so a finished session can never be silently reopened
# or re-ended.
SESSION_STATUS_TRANSITIONS: dict[SessionStatus, frozenset[SessionStatus]] = {
    SessionStatus.IN_PROGRESS: frozenset({SessionStatus.COMPLETED, SessionStatus.ENDED_EARLY}),
    SessionStatus.COMPLETED: frozenset(),
    SessionStatus.ENDED_EARLY: frozenset(),
}


class QuestionSource(enum.StrEnum):
    BANK = "bank"
    GENERATED = "generated"
    FOLLOW_UP = "follow_up"
