"""proctoring_violations: make user_id nullable for external attempts

Revision ID: proctoring_violations_nullable_user
Revises: external_legacy_proctoring
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa

revision = "pv_nullable_user"
down_revision = "external_legacy_proctoring"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "proctoring_violations",
        "user_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "proctoring_violations",
        "user_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
