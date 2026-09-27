"""category-specific rubrics and richer speech metrics

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-27

Replaces the universal STAR rubric with a category-specific one (behavioral/technical/
situational — see app/schemas/feedback.py) and adds the deterministic metrics Phase 7 needs:
a separate "possible" filler tier and a propagated transcription-quality warning. `star` is
renamed to `rubric` and `sample_answer` to `answer_example` since both now hold a
category-dependent shape rather than one fixed one — existing JSON payloads still validate
unchanged (see StarScores' backward-compat alias in schemas/feedback.py).
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("answers") as batch_op:
        batch_op.add_column(sa.Column("category", sa.String(16), nullable=True))
        batch_op.add_column(
            sa.Column("possible_filler_count", sa.Integer(), nullable=False, server_default="0")
        )
        # Nullable for now — MySQL rejects a literal DEFAULT on a JSON column outright ("BLOB,
        # TEXT, GEOMETRY or JSON column ... can't have a default value"), unlike SQLite, which
        # silently accepts one. Backfilled below via UPDATE, then tightened to NOT NULL once
        # every existing row actually has a value.
        batch_op.add_column(sa.Column("possible_filler_breakdown", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("transcription_quality_warning", sa.Text(), nullable=True))
        batch_op.alter_column("star", new_column_name="rubric")
        batch_op.alter_column("sample_answer", new_column_name="answer_example")

    op.execute(
        "UPDATE answers SET possible_filler_breakdown = '{}' "
        "WHERE possible_filler_breakdown IS NULL"
    )

    with op.batch_alter_table("answers") as batch_op:
        batch_op.alter_column("possible_filler_breakdown", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("answers") as batch_op:
        batch_op.alter_column("answer_example", new_column_name="sample_answer")
        batch_op.alter_column("rubric", new_column_name="star")
        batch_op.drop_column("transcription_quality_warning")
        batch_op.drop_column("possible_filler_breakdown")
        batch_op.drop_column("possible_filler_count")
        batch_op.drop_column("category")
