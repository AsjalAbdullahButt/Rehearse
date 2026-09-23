"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_MYSQL_KW = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
        **_MYSQL_KW,
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "questions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("difficulty", sa.String(16), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        **_MYSQL_KW,
    )
    op.create_index("ix_questions_role", "questions", ["role"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
        **_MYSQL_KW,
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    op.create_table(
        "profiles",
        sa.Column(
            "id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("target_role", sa.String(64), nullable=True),
        sa.Column("answer_cap_s", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("voice_name", sa.String(128), nullable=True),
        sa.Column("voice_rate", sa.DECIMAL(3, 2), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("answer_cap_s IN (60, 120, 180, 300)", name="ck_profiles_answer_cap_s"),
        sa.CheckConstraint("voice_rate BETWEEN 0.5 AND 2.0", name="ck_profiles_voice_rate"),
        **_MYSQL_KW,
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(64), nullable=False),
        sa.Column("difficulty", sa.String(16), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        **_MYSQL_KW,
    )
    op.create_index("ix_sessions_user_id_started_at", "sessions", ["user_id", "started_at"])

    op.create_table(
        "answers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "question_id",
            sa.String(36),
            sa.ForeignKey("questions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("transcript", sa.Text(), nullable=False),
        sa.Column("words", sa.JSON(), nullable=False),
        sa.Column("duration_s", sa.DECIMAL(6, 2), nullable=False),
        sa.Column("wpm", sa.DECIMAL(6, 2), nullable=False),
        sa.Column("filler_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("filler_breakdown", sa.JSON(), nullable=False),
        sa.Column("long_pauses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rambling", sa.Text(), nullable=True),
        sa.Column("star", sa.JSON(), nullable=True),
        sa.Column("clarity", sa.SmallInteger(), nullable=True),
        sa.Column("on_topic", sa.Boolean(), nullable=True),
        sa.Column("feedback", sa.JSON(), nullable=True),
        sa.Column("sample_answer", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("clarity BETWEEN 0 AND 10", name="ck_answers_clarity"),
        **_MYSQL_KW,
    )
    op.create_index("ix_answers_session_id", "answers", ["session_id"])
    op.create_index("ix_answers_user_id_created_at", "answers", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("answers")
    op.drop_table("sessions")
    op.drop_table("profiles")
    op.drop_table("refresh_tokens")
    op.drop_table("questions")
    op.drop_table("users")
