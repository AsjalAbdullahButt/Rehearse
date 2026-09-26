"""fix unique index drift on refresh_tokens.token_hash and users.email

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-26

Migration 0001 created `refresh_tokens.token_hash` and `users.email` as a separately-named
UniqueConstraint (`uq_refresh_tokens_token_hash` / `uq_users_email`) — for `users.email`, it
also created a second, redundant *non-unique* `ix_users_email` alongside that constraint. The
models (RefreshToken.token_hash, User.email) declare `unique=True, index=True` on the column
instead, which SQLAlchemy renders as a single unique *index*, not a separate named constraint.
That drift is what `alembic check`/`--autogenerate` was reporting against every migration since
0001. This brings the real schema in line with what the models have always described, without
rewriting 0001 (already-applied to real databases).
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("refresh_tokens") as batch_op:
        batch_op.drop_constraint("uq_refresh_tokens_token_hash", type_="unique")
        batch_op.create_index("ix_refresh_tokens_token_hash", ["token_hash"], unique=True)

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_email")
        batch_op.drop_constraint("uq_users_email", type_="unique")
        batch_op.create_index("ix_users_email", ["email"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_email")
        batch_op.create_unique_constraint("uq_users_email", ["email"])
        batch_op.create_index("ix_users_email", ["email"], unique=False)

    with op.batch_alter_table("refresh_tokens") as batch_op:
        batch_op.drop_index("ix_refresh_tokens_token_hash")
        batch_op.create_unique_constraint("uq_refresh_tokens_token_hash", ["token_hash"])
