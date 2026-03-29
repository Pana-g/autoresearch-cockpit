"""add error_message to runs

Revision ID: m3h4i5j6k7l8
Revises: l2a3b4c5d6e7
Create Date: 2026-03-20 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm3h4i5j6k7l8'
down_revision: Union[str, None] = 'l2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('runs', sa.Column('error_message', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('runs', 'error_message')
