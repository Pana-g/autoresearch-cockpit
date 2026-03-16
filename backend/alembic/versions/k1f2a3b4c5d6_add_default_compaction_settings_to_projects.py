"""add default compaction settings to projects

Revision ID: k1f2a3b4c5d6
Revises: j0e1f2a3b4c5
Create Date: 2026-03-16 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k1f2a3b4c5d6'
down_revision: Union[str, None] = 'j0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('default_auto_compact', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('projects', sa.Column('default_compact_threshold_pct', sa.Integer(), nullable=False, server_default='50'))
    op.add_column('projects', sa.Column('default_context_limit', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('projects', 'default_context_limit')
    op.drop_column('projects', 'default_compact_threshold_pct')
    op.drop_column('projects', 'default_auto_compact')
