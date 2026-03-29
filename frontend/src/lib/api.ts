import type {
  AgentStep,
  ChannelTypeInfo,
  CompactionInfo,
  ContextUsage,
  Credential,
  GitLogEntry,
  NotificationChannel,
  NotificationEventType,
  Project,
  ProviderInfo,
  Run,
  RunAction,
  RunNote,
  TokenUsage,
  TrainingStep,
  UsageSummary,
} from "./types";
import { useConnectionStore } from "@/stores/connection-store";

/** Get the active server's base URL */
function getBase(): string {
  return useConnectionStore.getState().getActive().url;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return { "Content-Type": "application/json", ...extra };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    ...init,
    headers: headers(init?.headers as Record<string, string>),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ── Projects ─────────────────────────────────────────── */

export const projects = {
  list: () => request<Project[]>("/projects"),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (body: { name: string; description?: string; source_path: string }) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  browseDirs: (path: string) =>
    request<{ dirs: string[]; base: string }>(`/projects/browse-dirs?path=${encodeURIComponent(path)}`),
  setBest: (projectId: string, trainingStepId: string) =>
    request<Project>(`/projects/${projectId}/best`, {
      method: "PUT",
      body: JSON.stringify({ training_step_id: trainingStepId }),
    }),
  updateSettings: (projectId: string, settings: {
    default_auto_approve?: boolean;
    default_auto_continue?: boolean;
    default_max_iterations?: number;
    default_overfit_floor?: number | null;
    default_overfit_margin?: number | null;
    default_include_machine_info?: boolean;
    default_max_consecutive_failures?: number;
    default_auto_compact?: boolean;
    default_compact_threshold_pct?: number;
    default_context_limit?: number;
  }) =>
    request<Project>(`/projects/${projectId}/settings`, {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
  trainingSteps: (projectId: string) =>
    request<TrainingStep[]>(`/projects/${projectId}/training-steps`),
};

/* ── Runs ─────────────────────────────────────────────── */

export const runs = {
  list: (projectId: string, limit = 25, offset = 0) => request<Run[]>(`/projects/${projectId}/runs?limit=${limit}&offset=${offset}`),
  get: (projectId: string, runId: string) =>
    request<Run>(`/projects/${projectId}/runs/${runId}`),
  create: (projectId: string, body: { provider: string; model: string; credential_id?: string; include_machine_info?: boolean; max_consecutive_failures?: number; auto_compact?: boolean; max_iterations?: number }) =>
    request<Run>(`/projects/${projectId}/runs`, { method: "POST", body: JSON.stringify(body) }),
  action: (projectId: string, runId: string, action: RunAction) =>
    request<{ status: string }>(`/projects/${projectId}/runs/${runId}/actions`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  agentSteps: (projectId: string, runId: string, limit = 25, offset = 0) =>
    request<AgentStep[]>(`/projects/${projectId}/runs/${runId}/agent-steps?limit=${limit}&offset=${offset}`),
  trainingSteps: (projectId: string, runId: string, limit = 25, offset = 0) =>
    request<TrainingStep[]>(`/projects/${projectId}/runs/${runId}/training-steps?limit=${limit}&offset=${offset}`),
  chartData: (projectId: string, runId: string) =>
    request<{ iteration: number; val_bpb: number | null; improved: boolean | null; status: string }[]>(`/projects/${projectId}/runs/${runId}/chart-data`),
  gitLog: (projectId: string, runId: string) =>
    request<GitLogEntry[]>(`/projects/${projectId}/runs/${runId}/git-log`),
  checkpointRestart: (projectId: string, runId: string, iteration: number, resetTrainPy: boolean = false) =>
    request<{ status: string; iteration: number; best_val_bpb: number | null; commit_sha: string }>(
      `/projects/${projectId}/runs/${runId}/checkpoint-restart`,
      { method: "POST", body: JSON.stringify({ iteration, reset_train_py: resetTrainPy }) },
    ),
  getProgram: (projectId: string, runId: string) =>
    request<{ content: string }>(`/projects/${projectId}/runs/${runId}/program`),
  updateProgram: (projectId: string, runId: string, content: string) =>
    request<{ status: string }>(`/projects/${projectId}/runs/${runId}/program`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  updateTrainPy: (projectId: string, runId: string, content: string) =>
    request<{ status: string }>(`/projects/${projectId}/runs/${runId}/train-py`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  workspaceFiles: (projectId: string, runId: string) =>
    request<{
      files: Record<string, string | null>;
      notable_files: string[];
      workspace_path: string;
      current_commit: string | null;
      best_commit: string | null;
      git_branch: string | null;
    }>(`/projects/${projectId}/runs/${runId}/workspace-files`),
  updateSettings: (projectId: string, runId: string, settings: { auto_approve?: boolean; auto_continue?: boolean; max_iterations?: number; stop_requested?: boolean; overfit_floor?: number | null; overfit_margin?: number | null; provider?: string; model?: string; credential_id?: string; auto_compact?: boolean; compact_threshold_pct?: number; context_limit?: number; max_consecutive_failures?: number }) =>
    request<Run>(`/projects/${projectId}/runs/${runId}/settings`, {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
  getCompaction: (projectId: string, runId: string) =>
    request<CompactionInfo>(`/projects/${projectId}/runs/${runId}/compaction`),
  getContextUsage: (projectId: string, runId: string) =>
    request<ContextUsage>(`/projects/${projectId}/runs/${runId}/context-usage`),
  applyCompaction: (projectId: string, runId: string) =>
    request<{ status: string; compacted_up_to: number }>(`/projects/${projectId}/runs/${runId}/compaction/apply`, {
      method: "POST",
    }),
  updateCompaction: (projectId: string, runId: string, summary: string, compactedUpTo: number) =>
    request<{ status: string }>(`/projects/${projectId}/runs/${runId}/compaction`, {
      method: "PUT",
      body: JSON.stringify({ summary, compacted_up_to: compactedUpTo }),
    }),
  clearCompaction: (projectId: string, runId: string) =>
    request<{ status: string }>(`/projects/${projectId}/runs/${runId}/compaction`, {
      method: "DELETE",
    }),
};

/* ── Notes ────────────────────────────────────────────── */

export const notes = {
  list: (runId: string) => request<RunNote[]>(`/runs/${runId}/notes`),
  create: (runId: string, content: string) =>
    request<RunNote>(`/runs/${runId}/notes`, { method: "POST", body: JSON.stringify({ content }) }),
  toggle: (runId: string, noteId: string, active: boolean) =>
    request<RunNote>(`/runs/${runId}/notes/${noteId}?active=${active}`, { method: "PATCH" }),
  update: (runId: string, noteId: string, content: string) =>
    request<RunNote>(`/runs/${runId}/notes/${noteId}?content=${encodeURIComponent(content)}`, { method: "PATCH" }),
  delete: (runId: string, noteId: string) =>
    request<void>(`/runs/${runId}/notes/${noteId}`, { method: "DELETE" }),
};

/* ── Providers ────────────────────────────────────────── */

export const providers = {
  list: () => request<ProviderInfo[]>("/providers"),
  models: (name: string, credentialId?: string) => {
    const qs = credentialId ? `?credential_id=${credentialId}` : "";
    return request<{ provider: string; models: string[]; cached_at_age: number | null }>(`/providers/${name}/models${qs}`);
  },
  refreshModels: (name: string, credentialId?: string) => {
    const qs = credentialId ? `?credential_id=${credentialId}` : "";
    return request<{ provider: string; models: string[]; cached_at_age: number | null }>(`/providers/${name}/models/refresh${qs}`, { method: "POST" });
  },
  /** Stream a chat response for model validation. Returns a ReadableStream via SSE. */
  chatStream: (body: {
    provider: string;
    model: string;
    credential_id?: string;
    messages: { role: string; content: string }[];
  }) =>
    fetch(`${getBase()}/providers/chat`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    }),
};

/* ── Copilot Device Auth ──────────────────────────────── */

export const copilotAuth = {
  startDeviceFlow: () =>
    request<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }>(
      "/copilot/device-auth/start",
      { method: "POST" },
    ),
  pollDeviceFlow: (deviceCode: string) =>
    request<{ status: string; access_token?: string; error?: string }>(
      "/copilot/device-auth/poll",
      { method: "POST", body: JSON.stringify({ device_code: deviceCode }) },
    ),
  detectProxy: () =>
    request<{ found: boolean; base_url?: string; api_key?: string; models?: string[] }>(
      "/copilot/detect-proxy",
    ),
};

/* ── Credentials ──────────────────────────────────────── */

export const credentials = {
  list: () => request<Credential[]>("/credentials"),
  create: (body: { name: string; provider: string; auth_type?: string; credentials: Record<string, string> }) =>
    request<Credential>("/credentials", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; credentials?: Record<string, string>; is_active?: boolean }) =>
    request<Credential>(`/credentials/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/credentials/${id}`, { method: "DELETE" }),
  validate: (id: string) => request<{ valid: boolean }>(`/credentials/${id}/validate`, { method: "POST" }),
};

/* ── Usage ────────────────────────────────────────────── */

export const usage = {
  list: (runId?: string, limit = 100) => {
    const params = new URLSearchParams();
    if (runId) params.set("run_id", runId);
    params.set("limit", String(limit));
    return request<TokenUsage[]>(`/usage?${params}`);
  },
  summary: (runId?: string) => {
    const qs = runId ? `?run_id=${runId}` : "";
    return request<UsageSummary>(`/usage/summary${qs}`);
  },
};

/* ── Notification Channels ────────────────────────────── */

export const channels = {
  types: () => request<ChannelTypeInfo[]>("/channel-types"),
  eventTypes: () => request<string[]>("/notification-event-types"),
  list: () => request<NotificationChannel[]>("/channels"),
  create: (body: {
    name: string;
    channel_type: string;
    config: Record<string, string>;
    notification_events?: NotificationEventType[];
    linked_run_id?: string | null;
  }) =>
    request<NotificationChannel>("/channels", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: {
    name?: string;
    config?: Record<string, string>;
    notification_events?: NotificationEventType[];
    is_active?: boolean;
    linked_run_id?: string | null;
  }) =>
    request<NotificationChannel>(`/channels/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/channels/${id}`, { method: "DELETE" }),
  test: (id: string) => request<{ status: string }>(`/channels/${id}/test`, { method: "POST" }),
  validate: (id: string) => request<{ valid: boolean; error?: string }>(`/channels/${id}/validate`, { method: "POST" }),
};

/* ── Runtime Settings ─────────────────────────────────── */

export interface RuntimeSettings {
  default_training_timeout_seconds: number;
  default_agent_inactivity_timeout: number;
  cors_origins: string[];
  encryption_key_set: boolean;
}

export interface RuntimeSettingsUpdate {
  default_training_timeout_seconds?: number;
  default_agent_inactivity_timeout?: number;
  encryption_key?: string;
}

export const runtimeSettings = {
  get: () => request<RuntimeSettings>("/settings"),
  update: (body: RuntimeSettingsUpdate) =>
    request<RuntimeSettings>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
};

/* ── SSE helpers ──────────────────────────────────────── */

/** Build the SSE URL for a run */
export function getSSEUrl(runId: string): string {
  return `${getBase()}/runs/${runId}/events`;
}

/** Check if the server is reachable */
export async function checkConnection(serverUrl: string): Promise<{ reachable: boolean }> {
  try {
    const res = await fetch(`${serverUrl}/health`);
    return { reachable: res.ok };
  } catch {
    return { reachable: false };
  }
}
