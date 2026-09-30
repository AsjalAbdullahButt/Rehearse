"""profile resume memory

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-30

Adds `profiles.candidate_background`/`skills`/`years_experience` so a candidate's resume-derived
background can be saved once (Settings) and pre-fill every future session's setup form, instead
of re-uploading/re-typing it every time. Nullable, no backfill needed — every existing profile
simply has nothing saved yet, which reads identically to "never uploaded a resume."
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("candidate_background", sa.Text(), nullable=True))
    op.add_column("profiles", sa.Column("skills", sa.JSON(), nullable=True))
    op.add_column("profiles", sa.Column("years_experience", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("profiles") as batch_op:
        batch_op.drop_column("years_experience")
        batch_op.drop_column("skills")
        batch_op.drop_column("candidate_background")
