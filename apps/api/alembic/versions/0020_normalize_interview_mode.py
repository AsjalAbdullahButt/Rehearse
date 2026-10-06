"""normalize sessions.interview_mode to the enum names SQLAlchemy stores

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-11

Migration 0016 gave `sessions.interview_mode` a lowercase server default ("technical_qa"), but the
ORM stores and reads enum *names* ("TECHNICAL_QA", like every other enum column). Any session row
created before interview modes existed therefore held a value the ORM could not load, and the
whole history/progress list failed with a LookupError. This rewrites those rows and fixes the
default so it cannot happen again.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE sessions SET interview_mode = UPPER(interview_mode) "
        "WHERE interview_mode <> UPPER(interview_mode)"
    )
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.alter_column(
            "interview_mode",
            existing_type=sa.String(length=24),
            existing_nullable=False,
            server_default="TECHNICAL_QA",
        )


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.alter_column(
            "interview_mode",
            existing_type=sa.String(length=24),
            existing_nullable=False,
            server_default="technical_qa",
        )
