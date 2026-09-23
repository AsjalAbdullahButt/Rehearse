import uuid

from sqlalchemy import Boolean, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import Category, Difficulty, Role


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # native_enum=False stores role/difficulty/category as VARCHAR + CHECK rather than a
    # MySQL-native ENUM column, so the same model works against SQLite in tests and adding
    # a new role later is an INSERT into the seed data, not an ALTER TYPE.
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, native_enum=False, length=32, validate_strings=True),
        nullable=False,
        index=True,
    )
    difficulty: Mapped[Difficulty] = mapped_column(
        SAEnum(Difficulty, native_enum=False, length=16, validate_strings=True), nullable=False
    )
    category: Mapped[Category] = mapped_column(
        SAEnum(Category, native_enum=False, length=16, validate_strings=True), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
