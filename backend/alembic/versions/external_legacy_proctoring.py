"""external attempts: legacy proctoring support

Adds external_attempt_id FK to proctoring_violations (so the legacy table
can store violations for external tests), makes session_id nullable, and
adds screen_recording_path to external_attempts.

Revision ID: external_legacy_proctoring
Revises: external_proctoring_init
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa


revision = "external_legacy_proctoring"
down_revision = "external_proctoring_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "proctoring_violations",
        "session_id",
        existing_type=sa.String(),
        nullable=True,
    )
    op.add_column(
        "proctoring_violations",
        sa.Column(
            "external_attempt_id",
            sa.Integer(),
            sa.ForeignKey("external_attempts.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
    )
    op.add_column(
        "external_attempts",
        sa.Column("screen_recording_path", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("external_attempts", "screen_recording_path")
    op.drop_column("proctoring_violations", "external_attempt_id")
    op.alter_column(
        "proctoring_violations",
        "session_id",
        existing_type=sa.String(),
        nullable=False,
    )
