"""external tests: tables for admin-created reusable tests assigned from pk

Revision ID: external_tests_init
Revises: add_lang_prelim
Create Date: 2026-05-13

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "external_tests_init"
down_revision = "add_lang_prelim"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_tests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(), nullable=False, server_default="pk"),
        sa.Column("external_owner_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_attempt_limit", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("default_deadline_at", sa.DateTime(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_external_tests_source", "external_tests", ["source"])
    op.create_index("ix_external_tests_external_owner_id", "external_tests", ["external_owner_id"])

    op.create_table(
        "external_questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("test_id", sa.Integer(), sa.ForeignKey("external_tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_number", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("question_type", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("options", JSONB(), nullable=True),
        sa.Column("correct_answer", JSONB(), nullable=True),
        sa.Column("points", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_external_questions_test_id", "external_questions", ["test_id"])

    op.create_table(
        "external_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("test_id", sa.Integer(), sa.ForeignKey("external_tests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_user_id", sa.String(), nullable=False),
        sa.Column("external_user_email", sa.String(), nullable=True),
        sa.Column("external_user_name", sa.String(), nullable=True),
        sa.Column("external_assignment_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="in_progress"),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("answers", JSONB(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("webhook_delivered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_external_attempts_test_id", "external_attempts", ["test_id"])
    op.create_index("ix_external_attempts_external_user_id", "external_attempts", ["external_user_id"])
    op.create_index("ix_external_attempts_external_assignment_id", "external_attempts", ["external_assignment_id"])
    op.create_index("ix_external_attempts_status", "external_attempts", ["status"])


def downgrade() -> None:
    op.drop_table("external_attempts")
    op.drop_table("external_questions")
    op.drop_table("external_tests")
