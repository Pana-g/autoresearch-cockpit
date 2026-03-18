"""add notification channels table

Revision ID: l2g3h4i5j6k7
Revises: k1f2a3b4c5d6
Create Date: 2026-03-16 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l2g3h4i5j6k7'
down_revision: Union[str, None] = 'k1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notification_channels',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), unique=True, nullable=False),
        sa.Column('channel_type', sa.String(50), nullable=False),
        sa.Column('encrypted_config', sa.Text, nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.text('true')),
        sa.Column('notification_events', sa.Text, nullable=False,
                  server_default='["new_best","training_failed","run_completed","run_failed"]'),
        sa.Column('commands_enabled', sa.Boolean, nullable=False, server_default=sa.text('false')),
        sa.Column('linked_run_id', sa.String(36),
                  sa.ForeignKey('runs.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('notification_channels')
