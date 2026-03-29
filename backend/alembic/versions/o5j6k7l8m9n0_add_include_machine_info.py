"""add include_machine_info to runs and projects

Revision ID: o5j6k7l8m9n0
Revises: n4i5j6k7l8m9
Create Date: 2026-03-21 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'o5j6k7l8m9n0'
down_revision: Union[str, None] = 'n4i5j6k7l8m9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('runs', sa.Column('include_machine_info', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('projects', sa.Column('default_include_machine_info', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('runs', 'include_machine_info')
    op.drop_column('projects', 'default_include_machine_info')
