"""update compact_threshold_pct default to 75

Revision ID: p6k7l8m9n0o1
Revises: o5j6k7l8m9n0
Create Date: 2026-03-21
"""
from alembic import op

revision = "p6k7l8m9n0o1"
down_revision = "o5j6k7l8m9n0"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('runs', 'compact_threshold_pct', server_default='75')
    op.alter_column('projects', 'default_compact_threshold_pct', server_default='75')


def downgrade():
    op.alter_column('runs', 'compact_threshold_pct', server_default='50')
    op.alter_column('projects', 'default_compact_threshold_pct', server_default='50')
