"""add max_consecutive_failures and drop commands_enabled

Revision ID: q7l8m9n0o1p2
Revises: p6k7l8m9n0o1
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa

revision = "q7l8m9n0o1p2"
down_revision = "p6k7l8m9n0o1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('runs', sa.Column('max_consecutive_failures', sa.Integer(), nullable=False, server_default='6'))
    op.add_column('projects', sa.Column('default_max_consecutive_failures', sa.Integer(), nullable=False, server_default='6'))
    op.drop_column('notification_channels', 'commands_enabled')


def downgrade():
    op.add_column('notification_channels', sa.Column('commands_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.drop_column('projects', 'default_max_consecutive_failures')
    op.drop_column('runs', 'max_consecutive_failures')
