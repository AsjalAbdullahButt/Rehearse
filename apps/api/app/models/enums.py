import enum


class Role(str, enum.Enum):
    SOFTWARE_ENGINEER = "software-engineer"
    FRONTEND = "frontend"
    BACKEND = "backend"
    DATA_SCIENTIST = "data-scientist"
    ML_ENGINEER = "ml-engineer"
    PRODUCT_MANAGER = "product-manager"
    UI_UX_DESIGNER = "ui-ux-designer"
    HR_GENERAL = "hr-general"


class Difficulty(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Category(str, enum.Enum):
    BEHAVIORAL = "behavioral"
    TECHNICAL = "technical"
    SITUATIONAL = "situational"
