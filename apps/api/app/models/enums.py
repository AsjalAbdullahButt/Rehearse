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


class SessionStatus(enum.StrEnum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class QuestionSource(enum.StrEnum):
    BANK = "bank"
    GENERATED = "generated"
    FOLLOW_UP = "follow_up"
