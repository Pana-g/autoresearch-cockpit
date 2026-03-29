from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, new_uuid
from app.models.state_machine import RunState


class Run(Base, TimestampMixin):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    state: Mapped[str] = mapped_column(String(40), default=RunState.IDLE.value)
    iteration: Mapped[int] = mapped_column(Integer, default=0)
    best_val_bpb: Mapped[float | None] = mapped_column(Float, nullable=True)
    provider: Mapped[str] = mapped_column(String(100), default="")
    model: Mapped[str] = mapped_column(String(100), default="")
    credential_id: Mapped[str | None] = mapped_column(
        ForeignKey("provider_credentials.id"), nullable=True
    )
    auto_approve: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    auto_continue: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    max_iterations: Mapped[int] = mapped_column(Integer, default=0, server_default="0")  # 0 = unlimited
    stop_requested: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    overfit_floor: Mapped[float | None] = mapped_column(Float, nullable=True)  # val_bpb below this = overfitting
    overfit_margin: Mapped[float | None] = mapped_column(Float, nullable=True)  # stop when val_bpb within this distance above floor
    pending_restart_from: Mapped[int | None] = mapped_column(Integer, nullable=True)  # set by checkpoint restart, consumed by wake_agent
    config_json: Mapped[str] = mapped_column(Text, default="{}")  # extra run config
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)  # reason for failure
    machine_info: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON machine hardware profile
    include_machine_info: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")  # send hardware profile to agent
    max_consecutive_failures: Mapped[int] = mapped_column(Integer, default=6, server_default="6")  # 0 = unlimited, fail run after this many consecutive failed iterations

    # Context compaction settings
    auto_compact: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    compact_threshold_pct: Mapped[int] = mapped_column(Integer, default=75, server_default="75")  # % of context window
    context_limit: Mapped[int] = mapped_column(Integer, default=0, server_default="0")  # 0 = auto-detect from model
    compacted_summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # compacted memory text
    compacted_up_to: Mapped[int | None] = mapped_column(Integer, nullable=True)  # iteration up to which records are compacted
    compacting: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # True while compaction is in progress

    project: Mapped["Project"] = relationship(back_populates="runs", lazy="selectin", foreign_keys=[project_id])  # noqa: F821
    workspace: Mapped["Workspace | None"] = relationship(  # noqa: F821
        back_populates="run", uselist=False, lazy="raise", cascade="all, delete-orphan", passive_deletes=True
    )
    agent_steps: Mapped[list["AgentStep"]] = relationship(back_populates="run", lazy="raise", cascade="all, delete-orphan", passive_deletes=True)
    training_steps: Mapped[list["TrainingStep"]] = relationship(
        back_populates="run", lazy="raise", cascade="all, delete-orphan", passive_deletes=True
    )
    memory_records: Mapped[list["RunMemory"]] = relationship(
        back_populates="run", lazy="raise", cascade="all, delete-orphan", passive_deletes=True
    )
    notes: Mapped[list["RunNote"]] = relationship(back_populates="run", lazy="raise", cascade="all, delete-orphan", passive_deletes=True)


class AgentStep(Base, TimestampMixin):
    __tablename__ = "agent_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    iteration: Mapped[int] = mapped_column(Integer)
    prompt: Mapped[str] = mapped_column(Text)
    response: Mapped[str] = mapped_column(Text, default="")
    patch: Mapped[str | None] = mapped_column(Text, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="pending")  # pending|completed|failed
    restarted_from_iteration: Mapped[int | None] = mapped_column(Integer, nullable=True)

    run: Mapped["Run"] = relationship(back_populates="agent_steps", lazy="raise")
    token_usage: Mapped["TokenUsage | None"] = relationship(
        back_populates="agent_step", uselist=False, lazy="selectin", cascade="all, delete-orphan", passive_deletes=True
    )


class TrainingStep(Base, TimestampMixin):
    __tablename__ = "training_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    agent_step_id: Mapped[str] = mapped_column(ForeignKey("agent_steps.id", ondelete="CASCADE"))
    iteration: Mapped[int] = mapped_column(Integer)
    commit_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    val_bpb: Mapped[float | None] = mapped_column(Float, nullable=True)
    improved: Mapped[bool | None] = mapped_column(nullable=True)
    stdout_log: Mapped[str] = mapped_column(Text, default="")
    stderr_log: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="pending")  # pending|running|completed|failed|timeout
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)

    run: Mapped["Run"] = relationship(back_populates="training_steps", lazy="selectin")
    agent_step: Mapped["AgentStep"] = relationship(lazy="selectin")


class RunMemory(Base, TimestampMixin):
    __tablename__ = "run_memory"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    iteration: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text)
    val_bpb: Mapped[float | None] = mapped_column(Float, nullable=True)
    improved: Mapped[bool | None] = mapped_column(nullable=True)

    run: Mapped["Run"] = relationship(back_populates="memory_records", lazy="raise")


class RunNote(Base, TimestampMixin):
    """Human-authored notes/hints injected into agent prompt context."""

    __tablename__ = "run_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(default=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped["Run"] = relationship(back_populates="notes", lazy="raise")
