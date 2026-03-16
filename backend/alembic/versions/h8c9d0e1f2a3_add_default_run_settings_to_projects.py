"""add default run settings to projects

Revision ID: h8c9d0e1f2a3
Revises: g7b8c9d0e1f2
Create Date: 2026-03-14 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h8c9d0e1f2a3'
down_revision: Union[str, None] = 'g7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('default_auto_approve', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('projects', sa.Column('default_auto_continue', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('projects', sa.Column('default_max_iterations', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('projects', sa.Column('default_overfit_floor', sa.Float(), nullable=True))
    op.add_column('projects', sa.Column('default_overfit_margin', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'default_overfit_margin')
    op.drop_column('projects', 'default_overfit_floor')
    op.drop_column('projects', 'default_max_iterations')
    op.drop_column('projects', 'default_auto_continue')
    op.drop_column('projects', 'default_auto_approve')
