"""add language to preliminary_test_sessions

Revision ID: add_lang_prelim
Revises: 7976430542e5
Create Date: 2025-02-16

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_lang_prelim'
down_revision = '7976430542e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('preliminary_test_sessions', sa.Column('language', sa.String(), server_default='en', nullable=True))


def downgrade() -> None:
    op.drop_column('preliminary_test_sessions', 'language')
