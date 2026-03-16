"""add restarted_from_iteration to agent_steps and pending_restart_from to runs

Revision ID: d4e5f6a7b8c9
Revises: a1b2c3d4e5f6
Create Date: 2026-03-15 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('agent_steps', sa.Column('restarted_from_iteration', sa.Integer(), nullable=True))
    op.add_column('runs', sa.Column('pending_restart_from', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('runs', 'pending_restart_from')
    op.drop_column('agent_steps', 'restarted_from_iteration')
