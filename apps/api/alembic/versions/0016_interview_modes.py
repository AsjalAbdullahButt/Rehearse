"""interview modes

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-06

Adds a session-level interview_mode so the same adaptive engine can run technical Q&A, spoken
coding/debugging, system-design, and case-study style interviews without executing candidate code.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "interview_mode",
                sa.String(length=24),
                nullable=False,
                server_default="technical_qa",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_column("interview_mode")
