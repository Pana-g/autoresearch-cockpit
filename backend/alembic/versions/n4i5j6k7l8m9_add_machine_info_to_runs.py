"""add machine_info to runs

Revision ID: n4i5j6k7l8m9
Revises: m3h4i5j6k7l8
Create Date: 2026-03-20 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'n4i5j6k7l8m9'
down_revision: Union[str, None] = 'm3h4i5j6k7l8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('runs', sa.Column('machine_info', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('runs', 'machine_info')
