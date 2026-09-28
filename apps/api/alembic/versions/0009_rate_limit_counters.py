"""atomic fixed-window rate limit counters, replacing rate_limit_hits

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-28

Replaces `rate_limit_hits` (one row per request, counted via an unlocked SELECT COUNT(*) that
wasn't atomic under concurrent requests — see app/services/repo.py's record_rate_limit_hit) with
`rate_limit_counters` (one row per (key, window_start) fixed-window bucket, incremented via a
single atomic UPSERT). Safe to drop-and-recreate outright rather than migrate data across: every
row in the old table is transient rate-limit bookkeeping with a lifetime measured in seconds to
an hour, never user-facing data, so there is nothing worth preserving across the cutover.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

_MYSQL_KW = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.drop_index("ix_rate_limit_hits_key_created_at", table_name="rate_limit_hits")
    op.drop_table("rate_limit_hits")

    op.create_table(
        "rate_limit_counters",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("window_start", sa.DateTime(), nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        **_MYSQL_KW,
    )
    op.create_index(
        "uq_rate_limit_counters_key_window",
        "rate_limit_counters",
        ["key", "window_start"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_rate_limit_counters_key_window", table_name="rate_limit_counters")
    op.drop_table("rate_limit_counters")

    op.create_table(
        "rate_limit_hits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        **_MYSQL_KW,
    )
    op.create_index("ix_rate_limit_hits_key_created_at", "rate_limit_hits", ["key", "created_at"])
