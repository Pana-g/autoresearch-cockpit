"""add best_run_id and best_iteration to projects

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-03-14 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('best_run_id', sa.String(36), sa.ForeignKey('runs.id', ondelete='SET NULL'), nullable=True))
    op.add_column('projects', sa.Column('best_iteration', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'best_iteration')
    op.drop_column('projects', 'best_run_id')
