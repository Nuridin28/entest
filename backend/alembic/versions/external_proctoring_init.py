"""external proctoring: events table + initial_photo_path on attempts

Revision ID: external_proctoring_init
Revises: external_tests_is_draft
Create Date: 2026-05-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "external_proctoring_init"
down_revision = "external_tests_is_draft"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "external_attempts",
        sa.Column("initial_photo_path", sa.String(), nullable=True),
    )
    op.add_column(
        "external_attempts",
        sa.Column("violation_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "external_proctoring_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.Integer(),
            sa.ForeignKey("external_attempts.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False, server_default="low"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("event_metadata", JSONB(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_external_proctoring_events_event_type",
        "external_proctoring_events",
        ["event_type"],
    )


def downgrade() -> None:
    op.drop_table("external_proctoring_events")
    op.drop_column("external_attempts", "violation_count")
    op.drop_column("external_attempts", "initial_photo_path")
