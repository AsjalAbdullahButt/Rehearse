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
