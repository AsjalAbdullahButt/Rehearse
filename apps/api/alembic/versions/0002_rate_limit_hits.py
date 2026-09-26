"""rate limit hits

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-26
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

_MYSQL_KW = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.create_table(
        "rate_limit_hits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        **_MYSQL_KW,
    )
    op.create_index("ix_rate_limit_hits_key_created_at", "rate_limit_hits", ["key", "created_at"])


def downgrade() -> None:
    op.drop_table("rate_limit_hits")
