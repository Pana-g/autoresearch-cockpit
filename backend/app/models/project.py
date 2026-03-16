from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, new_uuid


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    source_path: Mapped[str] = mapped_column(Text)  # original autoresearch workspace path
    best_val_bpb: Mapped[float | None] = mapped_column(Float, nullable=True)
    best_train_py: Mapped[str | None] = mapped_column(Text, nullable=True)  # best version of train.py across all runs
    best_run_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True)
    best_iteration: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Default run settings — applied when creating new runs
    default_auto_approve: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    default_auto_continue: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    default_max_iterations: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    default_overfit_floor: Mapped[float | None] = mapped_column(Float, nullable=True)
    default_overfit_margin: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Default context compaction settings
    default_auto_compact: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    default_compact_threshold_pct: Mapped[int] = mapped_column(Integer, default=50, server_default="50")
    default_context_limit: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    runs: Mapped[list["Run"]] = relationship(back_populates="project", lazy="raise", cascade="all, delete-orphan", passive_deletes=True, foreign_keys="[Run.project_id]")  # noqa: F821


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), unique=True)
    workspace_path: Mapped[str] = mapped_column(Text)  # isolated copy path
    git_branch: Mapped[str] = mapped_column(String(255))
    current_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    best_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)

    run: Mapped["Run"] = relationship(back_populates="workspace", lazy="selectin")  # noqa: F821
