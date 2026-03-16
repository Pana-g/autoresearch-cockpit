"""add best_val_bpb and best_train_py to projects

Revision ID: c3a8f7e12d01
Revises: b6ce246eb3c7
Create Date: 2026-03-13 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3a8f7e12d01'
down_revision: Union[str, None] = 'b6ce246eb3c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('best_val_bpb', sa.Float(), nullable=True))
    op.add_column('projects', sa.Column('best_train_py', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'best_train_py')
    op.drop_column('projects', 'best_val_bpb')
