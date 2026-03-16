/* ── Backend domain types ─────────────────────────────── */

export type RunState =
  | "idle"
  | "preparing"
  | "awaiting_agent"
  | "agent_running"
  | "awaiting_patch_review"
  | "patch_approved"
  | "training_running"
  | "training_finished"
  | "awaiting_next_action"
  | "done"
  | "paused"
  | "failed"
  | "canceled";

export type RunAction =
  | "start"
  | "pause"
  | "resume"
  | "cancel"
  | "approve_patch"
  | "reject_patch"
  | "continue"
  | "stop"
  | "retry"
  | "force_continue"
  | "force_fail";

export interface Project {
  id: string;
  name: string;
  description: string;
  source_path: string;
  best_val_bpb: number | null;
  best_run_id: string | null;
  best_iteration: number | null;
  default_auto_approve: boolean;
  default_auto_continue: boolean;
  default_max_iterations: number;
  default_overfit_floor: number | null;
  default_overfit_margin: number | null;
  default_auto_compact: boolean;
  default_compact_threshold_pct: number;
  default_context_limit: number;
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: string;
  project_id: string;
  state: RunState;
  iteration: number;
  best_val_bpb: number | null;
  provider: string;
  model: string;
  credential_id: string | null;
  auto_approve: boolean;
  auto_continue: boolean;
  max_iterations: number;
  stop_requested: boolean;
  overfit_floor: number | null;
  overfit_margin: number | null;
  auto_compact: boolean;
  compact_threshold_pct: number;
  context_limit: number;
  compacted_up_to: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentStep {
  id: string;
  run_id: string;
  iteration: number;
  prompt: string;
  response: string;
  patch: string | null;
  rationale: string | null;
  provider: string;
  model: string;
  status: string;
  restarted_from_iteration: number | null;
  token_usage: TokenUsage | null;
  created_at: string;
}

export interface TrainingStep {
  id: string;
  run_id: string;
  agent_step_id: string;
  iteration: number;
  commit_sha: string | null;
  val_bpb: number | null;
  improved: boolean | null;
  status: string;
  exit_code: number | null;
  stdout_log: string;
  stderr_log: string;
  created_at: string;
}

export interface Credential {
  id: string;
  name: string;
  provider: string;
  auth_type: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenUsage {
  id: string;
  agent_step_id: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost: number;
  usage_source: string;
  created_at: string;
}

export interface UsageSummary {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_estimated_cost: number;
  step_count: number;
}

export interface GitLogEntry {
  sha: string;
  message: string;
  date: string;
}

export interface RunNote {
  id: string;
  run_id: string;
  content: string;
  active: boolean;
  delivered_at: string | null;
  created_at: string;
}

export interface ProviderInfo {
  name: string;
  models: string[];
}

export interface CompactionInfo {
  current_summary: string | null;
  current_up_to: number | null;
  preview_summary: string | null;
  preview_up_to: number | null;
  memory_count: number;
  auto_compact: boolean;
  compact_threshold_pct: number;
  context_limit: number;
}

/* ── SSE event types ─────────────────────────────────── */

export type SSEEventType =
  | "state_change"
  | "workspace_ready"
  | "error"
  | "agent_streaming_start"
  | "agent_chunk"
  | "agent_phase_change"
  | "agent_streaming_end"
  | "agent_snapshot"
  | "patch_ready"
  | "patch_applied"
  | "patch_rejected"
  | "training_started"
  | "training_stdout"
  | "training_stderr"
  | "training_timeout"
  | "training_completed"
  | "training_failed"
  | "auto_approve"
  | "auto_continue"
  | "run_done"
  | "run_paused"
  | "run_canceled"
  | "checkpoint_restored"
  | "compaction_needed"
  | "compaction_done";

export interface SSEMessage {
  event: SSEEventType;
  data: Record<string, unknown>;
}
