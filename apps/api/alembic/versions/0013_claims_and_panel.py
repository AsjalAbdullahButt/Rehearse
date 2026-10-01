"""interview claims, panel interviews, resume claims

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-03

- `interview_claims`: statements worth probing (from answers or the resume) and how well each
  has been supported so far.
- `session_questions`: `claim_id` (the claim a probe question targets) and `panelist`.
- `sessions`: `panel` flag (default off — every existing session is a normal one-interviewer
  interview).
- `job_targets`: `resume_claims` JSON, the claims extracted from the resume in the same cached
  analysis call.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

# Must match every other migration's table-level charset/collation (see 0001_initial.py /
# 0011_adaptive_interview_engine.py's fix) — a new table left to the server/database default
# collation is incompatible with the rest of the schema's utf8mb4_unicode_ci VARCHAR keys for a
# foreign key constraint (MySQL error 3780), even when the column types otherwise match exactly.
_MYSQL_KW = {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def upgrade() -> None:
    op.create_table(
        "interview_claims",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("answer_id", sa.String(36), nullable=True),
        sa.Column(
            "parent_claim_id",
            sa.String(36),
            sa.ForeignKey("interview_claims.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source", sa.String(10), nullable=False, server_default="answer"),
        sa.Column("claim_text", sa.String(300), nullable=False),
        sa.Column("claim_type", sa.String(20), nullable=False),
        sa.Column("importance", sa.String(8), nullable=False),
        sa.Column("metric", sa.String(64), nullable=True),
        sa.Column("competency", sa.String(64), nullable=True),
        sa.Column("chain_depth", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("probe_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("verified_depth", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(24), nullable=False, server_default="unverified"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        **_MYSQL_KW,
    )
    op.create_index("ix_interview_claims_session_id", "interview_claims", ["session_id"])

    with op.batch_alter_table("session_questions") as batch_op:
        batch_op.add_column(sa.Column("claim_id", sa.String(36), nullable=True))
        batch_op.add_column(sa.Column("panelist", sa.String(24), nullable=True))
        batch_op.create_foreign_key(
            "fk_session_questions_claim_id",
            "interview_claims",
            ["claim_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("sessions") as batch_op:
        batch_op.add_column(
            sa.Column("panel", sa.Boolean(), nullable=False, server_default=sa.false())
        )

    with op.batch_alter_table("job_targets") as batch_op:
        batch_op.add_column(sa.Column("resume_claims", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("job_targets") as batch_op:
        batch_op.drop_column("resume_claims")

    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_column("panel")

    with op.batch_alter_table("session_questions") as batch_op:
        batch_op.drop_constraint("fk_session_questions_claim_id", type_="foreignkey")
        batch_op.drop_column("panelist")
        batch_op.drop_column("claim_id")

    op.drop_index("ix_interview_claims_session_id", table_name="interview_claims")
    op.drop_table("interview_claims")
