"""delivery coaching summaries

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-04

`answers.prosody` and `answers.camera` hold small, validated numeric summaries measured in the
browser (voice pitch/energy/volume; optional camera head-pose presence). Never audio, video or
frames. Nullable: every existing answer simply has no summary and renders without those items.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("answers") as batch_op:
        batch_op.add_column(sa.Column("prosody", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("camera", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("answers") as batch_op:
        batch_op.drop_column("camera")
        batch_op.drop_column("prosody")
