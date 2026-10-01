"""answer attempts (re-answer / deliberate practice)

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-02

A retry is a new `answers` row pointing at the original via `original_answer_id`, so the original
answer and its feedback are never replaced. Existing rows are originals: attempt_number defaults
to 1 and original_answer_id stays NULL.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("answers") as batch_op:
        batch_op.add_column(
            sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(sa.Column("original_answer_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key(
            "fk_answers_original_answer_id",
            "answers",
            ["original_answer_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_answers_original_answer_id", ["original_answer_id"])


def downgrade() -> None:
    with op.batch_alter_table("answers") as batch_op:
        batch_op.drop_index("ix_answers_original_answer_id")
        batch_op.drop_constraint("fk_answers_original_answer_id", type_="foreignkey")
        batch_op.drop_column("original_answer_id")
        batch_op.drop_column("attempt_number")
