from pydantic import BaseModel

from app.models.enums import Category, Difficulty, Role


class QuestionOut(BaseModel):
    id: str
    role: Role
    difficulty: Difficulty
    category: Category
    text: str

    model_config = {"from_attributes": True}
