"""multi-question session orchestration

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-27

Turns a session from a bare (role, difficulty) container into a real, server-controlled
multi-question interview: extended setup/personalization fields on `sessions`, a new
`session_questions` table recording exactly what was served and in what order, and a link from
`answers` to the specific SessionQuestion it answered.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

_MYSQL_KW = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

_QUESTION_COUNT_CHOICES = (3, 5, 8)
_ANSWER_CAP_CHOICES = (60, 120, 180, 300)


def upgrade() -> None:
    op.add_column("sessions", sa.Column("experience_level", sa.String(16), nullable=True))
    op.add_column(
        "sessions",
        sa.Column("focus", sa.String(16), nullable=False, server_default="mixed"),
    )
    op.add_column(
        "sessions",
        sa.Column("question_count", sa.Integer(), nullable=False, server_default="5"),
    )
    op.add_column(
        "sessions",
        sa.Column("answer_cap_s", sa.Integer(), nullable=False, server_default="120"),
    )
    op.add_column("sessions", sa.Column("company", sa.String(120), nullable=True))
    op.add_column("sessions", sa.Column("industry", sa.String(120), nullable=True))
    op.add_column("sessions", sa.Column("job_description", sa.Text(), nullable=True))
    op.add_column("sessions", sa.Column("candidate_background", sa.Text(), nullable=True))
    op.add_column("sessions", sa.Column("skills", sa.JSON(), nullable=True))
    op.add_column("sessions", sa.Column("focus_topics", sa.JSON(), nullable=True))
    op.add_column("sessions", sa.Column("years_experience", sa.Integer(), nullable=True))
    op.add_column("sessions", sa.Column("interviewer_style", sa.String(16), nullable=True))
    op.add_column("sessions", sa.Column("language", sa.String(32), nullable=True))
    op.add_column(
        "sessions",
        sa.Column("status", sa.String(16), nullable=False, server_default="in_progress"),
    )
    op.add_column(
        "sessions",
        sa.Column("current_question_number", sa.Integer(), nullable=False, server_default="0"),
    )
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.create_check_constraint(
            "ck_sessions_question_count",
            f"question_count IN ({', '.join(str(c) for c in _QUESTION_COUNT_CHOICES)})",
        )
        batch_op.create_check_constraint(
            "ck_sessions_answer_cap_s",
            f"answer_cap_s IN ({', '.join(str(c) for c in _ANSWER_CAP_CHOICES)})",
        )

    op.create_table(
        "session_questions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("question_id", sa.String(36), sa.ForeignKey("questions.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        **_MYSQL_KW,
    )
    op.create_index(
        "ux_session_questions_session_id_sequence",
        "session_questions",
        ["session_id", "sequence_number"],
        unique=True,
    )

    # A plain op.add_column with an inline ForeignKey compiles to ALTER TABLE ADD CONSTRAINT on
    # SQLite, which the dialect doesn't support outside batch mode (unlike a FK declared inside
    # CREATE TABLE, as in session_questions above) — batch mode does the copy-and-move dance
    # SQLite needs; on MySQL it's an ordinary ALTER TABLE either way.
    with op.batch_alter_table("answers") as batch_op:
        batch_op.add_column(
            sa.Column(
                "session_question_id",
                sa.String(36),
                sa.ForeignKey(
                    "session_questions.id",
                    ondelete="SET NULL",
                    name="fk_answers_session_question_id",
                ),
                nullable=True,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("answers") as batch_op:
        batch_op.drop_column("session_question_id")

    op.drop_index("ux_session_questions_session_id_sequence", table_name="session_questions")
    op.drop_table("session_questions")

    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_constraint("ck_sessions_answer_cap_s", type_="check")
        batch_op.drop_constraint("ck_sessions_question_count", type_="check")
        batch_op.drop_column("current_question_number")
        batch_op.drop_column("status")
        batch_op.drop_column("language")
        batch_op.drop_column("interviewer_style")
        batch_op.drop_column("years_experience")
        batch_op.drop_column("focus_topics")
        batch_op.drop_column("skills")
        batch_op.drop_column("candidate_background")
        batch_op.drop_column("job_description")
        batch_op.drop_column("industry")
        batch_op.drop_column("company")
        batch_op.drop_column("answer_cap_s")
        batch_op.drop_column("question_count")
        batch_op.drop_column("focus")
        batch_op.drop_column("experience_level")
