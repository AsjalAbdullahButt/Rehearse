"""adaptive interview engine

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-02

Adds the data the adaptive interviewer needs, all additive and nullable/defaulted so existing
users, sessions and answers keep working untouched:

- `questions`: taxonomy metadata (competency/subtopic/level/expected_concepts/tags).
- `session_questions`: which competency/level a question tested and why it was selected.
- `sessions`: `role_title` + `job_target_id` (custom roles / analysed job targets).
- `candidate_competencies`: persistent per-user, per-role mastery.
- `job_targets` / `job_competencies`: a target role/JD and its weighted competency map.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

# Must match every other migration's table-level charset/collation (see 0001_initial.py) — a new
# table left to the server/database default collation (MySQL 8's utf8mb4_0900_ai_ci) is
# incompatible with an existing utf8mb4_unicode_ci VARCHAR primary key for a foreign key
# constraint (MySQL error 3780), even though the column types otherwise match exactly.
_MYSQL_KW = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.create_table(
        "job_targets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("role_title", sa.String(80), nullable=False),
        sa.Column("company_name", sa.String(120), nullable=True),
        sa.Column("job_description", sa.Text(), nullable=True),
        sa.Column("seniority", sa.String(24), nullable=True),
        sa.Column("analysis_hash", sa.String(64), nullable=False),
        sa.Column("analysis_source", sa.String(16), nullable=False, server_default="default"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        **_MYSQL_KW,
    )
    op.create_index(
        "ux_job_targets_user_hash", "job_targets", ["user_id", "analysis_hash"], unique=True
    )

    op.create_table(
        "job_competencies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "job_target_id",
            sa.String(36),
            sa.ForeignKey("job_targets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("competency", sa.String(64), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("importance", sa.String(12), nullable=False, server_default="required"),
        sa.Column("resume_evidence", sa.String(12), nullable=False, server_default="unknown"),
        sa.Column("source", sa.String(16), nullable=False, server_default="role_default"),
        **_MYSQL_KW,
    )
    op.create_index(
        "ux_job_competency", "job_competencies", ["job_target_id", "competency"], unique=True
    )

    op.create_table(
        "candidate_competencies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("role", sa.String(64), nullable=False),
        sa.Column("competency", sa.String(64), nullable=False),
        sa.Column("mastery_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("questions_attempted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("successful_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("highest_level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_practiced_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        **_MYSQL_KW,
    )
    op.create_index(
        "ux_candidate_competency",
        "candidate_competencies",
        ["user_id", "role", "competency"],
        unique=True,
    )

    with op.batch_alter_table("questions") as batch_op:
        batch_op.add_column(sa.Column("competency", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("subtopic", sa.String(80), nullable=True))
        batch_op.add_column(sa.Column("level", sa.SmallInteger(), nullable=True))
        batch_op.add_column(sa.Column("expected_concepts", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("tags", sa.JSON(), nullable=True))
        batch_op.create_index("ix_questions_competency", ["competency"])

    with op.batch_alter_table("session_questions") as batch_op:
        batch_op.add_column(sa.Column("competency", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("level", sa.SmallInteger(), nullable=True))
        batch_op.add_column(sa.Column("selection_reason", sa.String(24), nullable=True))

    with op.batch_alter_table("sessions") as batch_op:
        batch_op.add_column(sa.Column("role_title", sa.String(80), nullable=True))
        batch_op.add_column(sa.Column("job_target_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key(
            "fk_sessions_job_target_id",
            "job_targets",
            ["job_target_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_constraint("fk_sessions_job_target_id", type_="foreignkey")
        batch_op.drop_column("job_target_id")
        batch_op.drop_column("role_title")

    with op.batch_alter_table("session_questions") as batch_op:
        batch_op.drop_column("selection_reason")
        batch_op.drop_column("level")
        batch_op.drop_column("competency")

    with op.batch_alter_table("questions") as batch_op:
        batch_op.drop_index("ix_questions_competency")
        batch_op.drop_column("tags")
        batch_op.drop_column("expected_concepts")
        batch_op.drop_column("level")
        batch_op.drop_column("subtopic")
        batch_op.drop_column("competency")

    op.drop_index("ux_candidate_competency", table_name="candidate_competencies")
    op.drop_table("candidate_competencies")
    op.drop_index("ux_job_competency", table_name="job_competencies")
    op.drop_table("job_competencies")
    op.drop_index("ux_job_targets_user_hash", table_name="job_targets")
    op.drop_table("job_targets")
