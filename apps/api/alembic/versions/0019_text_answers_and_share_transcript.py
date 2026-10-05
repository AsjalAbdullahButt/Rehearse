"""text answers and per-share transcript visibility

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-10

Adds answers.input_mode ("voice" for every existing row) and report_shares.include_transcript
(False for every existing link, which preserves what those links already exposed in the UI).
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("answers") as batch_op:
        batch_op.add_column(
            sa.Column("input_mode", sa.String(length=8), nullable=False, server_default="voice")
        )
    with op.batch_alter_table("report_shares") as batch_op:
        batch_op.add_column(
            sa.Column("include_transcript", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("report_shares") as batch_op:
        batch_op.drop_column("include_transcript")
    with op.batch_alter_table("answers") as batch_op:
        batch_op.drop_column("input_mode")
