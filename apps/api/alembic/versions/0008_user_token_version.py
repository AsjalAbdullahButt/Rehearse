"""user token_version for immediate session invalidation

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-28

Adds `users.token_version`, baked into every access/refresh JWT as the "ver" claim (see
app/core/auth.py's _encode_token/check_token_version) and bumped by change-password and
logout-all. Closes the gap where an already-issued *access* token had no revocation mechanism at
all and kept working until its own short TTL expired even after a password change or a
reported-compromise logout-all — only refresh tokens were actually revoked. `server_default="1"`
backfills every existing user with version 1, matching _encode_token's own fallback default, so
every already-issued token (all implicitly "version 1" before this column existed) keeps working
unchanged until the first version bump.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("token_version")
