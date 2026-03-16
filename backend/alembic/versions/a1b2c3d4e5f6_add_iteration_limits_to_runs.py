"""add max_iterations and stop_requested to runs

Revision ID: a1b2c3d4e5f6
Revises: c3a8f7e12d01
Create Date: 2026-03-14 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'c3a8f7e12d01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('runs', sa.Column('max_iterations', sa.Integer(), server_default='0', nullable=False))
    op.add_column('runs', sa.Column('stop_requested', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('runs', 'stop_requested')
    op.drop_column('runs', 'max_iterations')
