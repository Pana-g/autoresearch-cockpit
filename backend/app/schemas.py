"""Pydantic schemas for API request/response models."""

from datetime import datetime

from pydantic import BaseModel, Field


# ── Projects ──────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    source_path: str


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    source_path: str
    best_val_bpb: float | None = None
    best_run_id: str | None = None
    best_iteration: int | None = None
    default_auto_approve: bool = True
    default_auto_continue: bool = True
    default_max_iterations: int = 0
    default_overfit_floor: float | None = None
    default_overfit_margin: float | None = None
    default_auto_compact: bool = True
    default_compact_threshold_pct: int = 50
    default_context_limit: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectSettingsUpdate(BaseModel):
    default_auto_approve: bool | None = None
    default_auto_continue: bool | None = None
    default_max_iterations: int | None = None
    default_overfit_floor: float | None = Field(None)
    default_overfit_margin: float | None = Field(None)
    default_auto_compact: bool | None = None
    default_compact_threshold_pct: int | None = None
    default_context_limit: int | None = None


class SetProjectBestRequest(BaseModel):
    training_step_id: str


# ── Runs ──────────────────────────────────────────────────
class RunCreate(BaseModel):
    provider: str
    model: str
    credential_id: str | None = None
    auto_approve: bool | None = None  # None = use project default
    auto_continue: bool | None = None
    max_iterations: int | None = None
    overfit_floor: float | None = Field(None)
    overfit_margin: float | None = Field(None)


class RunResponse(BaseModel):
    id: str
    project_id: str
    state: str
    iteration: int
    best_val_bpb: float | None
    provider: str
    model: str
    credential_id: str | None
    auto_approve: bool
    auto_continue: bool
    max_iterations: int
    stop_requested: bool
    overfit_floor: float | None = None
    overfit_margin: float | None = None
    auto_compact: bool = True
    compact_threshold_pct: int = 50
    context_limit: int = 0
    compacted_up_to: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RunSettingsUpdate(BaseModel):
    auto_approve: bool | None = None
    auto_continue: bool | None = None
    max_iterations: int | None = None
    stop_requested: bool | None = None
    overfit_floor: float | None = Field(None)
    overfit_margin: float | None = Field(None)
    provider: str | None = None
    model: str | None = None
    credential_id: str | None = None
    auto_compact: bool | None = None
    compact_threshold_pct: int | None = None
    context_limit: int | None = None


class RunActionRequest(BaseModel):
    action: str  # start, pause, resume, cancel, approve_patch, reject_patch, continue, stop


# ── Agent Steps ───────────────────────────────────────────
class AgentStepResponse(BaseModel):
    id: str
    run_id: str
    iteration: int
    prompt: str
    response: str
    patch: str | None
    rationale: str | None
    provider: str
    model: str
    status: str
    restarted_from_iteration: int | None = None
    token_usage: "TokenUsageResponse | None" = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Training Steps ────────────────────────────────────────
class TrainingStepChartPoint(BaseModel):
    iteration: int
    val_bpb: float | None
    improved: bool | None
    status: str

    model_config = {"from_attributes": True}


class TrainingStepResponse(BaseModel):
    id: str
    run_id: str
    agent_step_id: str
    iteration: int
    commit_sha: str | None
    val_bpb: float | None
    improved: bool | None
    status: str
    exit_code: int | None
    stdout_log: str = ""
    stderr_log: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Provider Credentials ─────────────────────────────────
class CredentialCreate(BaseModel):
    name: str
    provider: str
    auth_type: str = "api_key"
    credentials: dict  # raw credentials (will be encrypted)


class CredentialResponse(BaseModel):
    id: str
    name: str
    provider: str
    auth_type: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CredentialUpdate(BaseModel):
    name: str | None = None
    credentials: dict | None = None
    is_active: bool | None = None


# ── Provider / Models ────────────────────────────────────
class ProviderInfo(BaseModel):
    name: str
    models: list[str] = Field(default_factory=list)


class ModelListResponse(BaseModel):
    provider: str
    models: list[str]
    cached_at_age: float | None = None  # seconds since last fetch, None if fresh


# ── Token Usage ──────────────────────────────────────────
class TokenUsageResponse(BaseModel):
    id: str
    agent_step_id: str
    provider: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    estimated_cost: float
    usage_source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageSummary(BaseModel):
    total_prompt_tokens: int
    total_completion_tokens: int
    total_estimated_cost: float
    step_count: int


# ── Notes / Context ──────────────────────────────────────
class NoteCreate(BaseModel):
    content: str


class NoteResponse(BaseModel):
    id: str
    run_id: str
    content: str
    active: bool
    delivered_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Program.md ───────────────────────────────────────────
class ProgramUpdate(BaseModel):
    content: str


# ── Git ──────────────────────────────────────────────────
class GitLogEntry(BaseModel):
    sha: str
    message: str
    date: str


class RollbackRequest(BaseModel):
    commit_sha: str


class CheckpointRestartRequest(BaseModel):
    iteration: int
    reset_train_py: bool = False


# ── Compaction ───────────────────────────────────────────
class CompactionResponse(BaseModel):
    current_summary: str | None = None
    current_up_to: int | None = None
    preview_summary: str | None = None
    preview_up_to: int | None = None
    memory_count: int = 0
    auto_compact: bool = True
    compact_threshold_pct: int = 50
    context_limit: int = 0


class ContextUsageResponse(BaseModel):
    prompt_tokens: int = 0
    context_limit: int = 0
    usage_pct: float = 0.0
    threshold_pct: int = 50
    threshold_tokens: int = 0
    compacted: bool = False
    compacted_up_to: int | None = None
    memory_count: int = 0


# ── Notification Channels ────────────────────────────────

NOTIFICATION_EVENT_TYPES = [
    "new_best",
    "training_failed",
    "run_completed",
    "run_failed",
    "patch_ready",
    "iteration_started",
    "run_canceled",
]


class ChannelTypeInfoResponse(BaseModel):
    name: str
    label: str
    config_fields: list[dict] = Field(default_factory=list)
    supports_commands: bool = False


class ChannelCreate(BaseModel):
    name: str
    channel_type: str
    config: dict  # raw config (will be encrypted)
    notification_events: list[str] = Field(
        default=["new_best", "training_failed", "run_completed", "run_failed"]
    )
    commands_enabled: bool = False
    linked_run_id: str | None = None


class ChannelUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None
    notification_events: list[str] | None = None
    commands_enabled: bool | None = None
    is_active: bool | None = None
    linked_run_id: str | None = None


class ChannelResponse(BaseModel):
    id: str
    name: str
    channel_type: str
    is_active: bool
    notification_events: list[str] = Field(default_factory=list)
    commands_enabled: bool
    linked_run_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
