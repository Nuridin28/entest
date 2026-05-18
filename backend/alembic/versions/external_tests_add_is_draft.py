"""external_tests: add is_draft flag

Revision ID: external_tests_is_draft
Revises: external_tests_init
Create Date: 2026-05-13

"""
from alembic import op
import sqlalchemy as sa


revision = "external_tests_is_draft"
down_revision = "external_tests_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "external_tests",
        sa.Column("is_draft", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("external_tests", "is_draft")
