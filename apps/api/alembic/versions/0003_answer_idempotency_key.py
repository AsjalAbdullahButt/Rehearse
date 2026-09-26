"""answer idempotency key

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-26
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("answers", sa.Column("idempotency_key", sa.String(255), nullable=True))
    op.create_index(
        "ux_answers_user_id_idempotency_key",
        "answers",
        ["user_id", "idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ux_answers_user_id_idempotency_key", table_name="answers")
    op.drop_column("answers", "idempotency_key")
