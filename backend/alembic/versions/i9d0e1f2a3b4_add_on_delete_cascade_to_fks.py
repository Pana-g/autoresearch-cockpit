"""add on_delete cascade to foreign keys

Revision ID: i9d0e1f2a3b4
Revises: h8c9d0e1f2a3
Create Date: 2026-03-15 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'i9d0e1f2a3b4'
down_revision: Union[str, None] = 'h8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, constraint_name, column, referred_table)
_FK_SPECS = [
    ("runs",           "runs_project_id_fkey",            "project_id",    "projects"),
    ("workspaces",     "workspaces_run_id_fkey",          "run_id",        "runs"),
    ("agent_steps",    "agent_steps_run_id_fkey",         "run_id",        "runs"),
    ("training_steps", "training_steps_run_id_fkey",      "run_id",        "runs"),
    ("training_steps", "training_steps_agent_step_id_fkey", "agent_step_id", "agent_steps"),
    ("run_memory",     "run_memory_run_id_fkey",          "run_id",        "runs"),
    ("run_notes",      "run_notes_run_id_fkey",           "run_id",        "runs"),
    ("token_usage",    "token_usage_agent_step_id_fkey",  "agent_step_id", "agent_steps"),
]


def upgrade() -> None:
    for table, constraint, column, referred in _FK_SPECS:
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.create_foreign_key(constraint, table, referred, [column], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    for table, constraint, column, referred in _FK_SPECS:
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.create_foreign_key(constraint, table, referred, [column], ["id"])
