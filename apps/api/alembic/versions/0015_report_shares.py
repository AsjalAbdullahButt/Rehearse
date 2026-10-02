"""secure shared report links

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-05

Adds candidate-controlled, read-only report shares. Public URL tokens are stored as hashes only,
can expire, and can be revoked without touching the underlying private interview data.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

_MYSQL_KW = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.create_table(
        "report_shares",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("answer_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("audience", sa.String(length=16), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_accessed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["answer_id"], ["answers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        **_MYSQL_KW,
    )
    op.create_index("ix_report_shares_answer_id", "report_shares", ["answer_id"], unique=False)
    op.create_index("ix_report_shares_token_hash", "report_shares", ["token_hash"], unique=True)
    op.create_index(
        "ix_report_shares_user_id_created_at",
        "report_shares",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_report_shares_user_id_created_at", table_name="report_shares")
    op.drop_index("ix_report_shares_token_hash", table_name="report_shares")
    op.drop_index("ix_report_shares_answer_id", table_name="report_shares")
    op.drop_table("report_shares")
