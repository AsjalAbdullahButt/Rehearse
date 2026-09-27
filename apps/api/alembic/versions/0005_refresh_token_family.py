"""refresh token family for grace-period reuse detection

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-27

Rotation races (see app/routers/auth.py's `refresh()`) need a way to tell a legitimate
concurrent-tab refresh (benign) apart from a stolen token replayed well after rotation
(malicious) without treating both as the same "reuse" event. `family_id` groups every token
descended from one login/register under a shared id, so a reuse spotted within the grace period
can be resolved by rotating from the family's current active token instead of revoking every
session for the user.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("family_id", sa.String(36), nullable=True))
    # Backfill: each pre-existing token becomes its own single-member family. Safe, since the
    # grace-period lookup only ever matters for a token rotated *after* this migration lands.
    op.execute("UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL")
    with op.batch_alter_table("refresh_tokens") as batch_op:
        batch_op.alter_column("family_id", existing_type=sa.String(36), nullable=False)
        batch_op.create_index("ix_refresh_tokens_family_id", ["family_id"])


def downgrade() -> None:
    with op.batch_alter_table("refresh_tokens") as batch_op:
        batch_op.drop_index("ix_refresh_tokens_family_id")
        batch_op.drop_column("family_id")
