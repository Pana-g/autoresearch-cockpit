"""add context compaction to runs

Revision ID: j0e1f2a3b4c5
Revises: i9d0e1f2a3b4
Create Date: 2026-03-16 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j0e1f2a3b4c5'
down_revision: Union[str, None] = 'i9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('runs', sa.Column('auto_compact', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('runs', sa.Column('compact_threshold_pct', sa.Integer(), nullable=False, server_default='50'))
    op.add_column('runs', sa.Column('context_limit', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('runs', sa.Column('compacted_summary', sa.Text(), nullable=True))
    op.add_column('runs', sa.Column('compacted_up_to', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('runs', 'compacted_up_to')
    op.drop_column('runs', 'compacted_summary')
    op.drop_column('runs', 'context_limit')
    op.drop_column('runs', 'compact_threshold_pct')
    op.drop_column('runs', 'auto_compact')
