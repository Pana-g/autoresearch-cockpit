import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projects, runs, providers, credentials, usage, notes, channels } from "@/lib/api";
import type { RunAction, NotificationEventType } from "@/lib/types";

/* ── Projects ─────────────────────────────────────────── */

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: projects.list });
}

export function useProject(id: string) {
  return useQuery({ queryKey: ["projects", id], queryFn: () => projects.get(id), enabled: !!id });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: projects.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useSetProjectBest(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trainingStepId: string) => projects.setBest(projectId, trainingStepId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProjectSettings(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      default_auto_approve?: boolean;
      default_auto_continue?: boolean;
      default_max_iterations?: number;
      default_overfit_floor?: number | null;
      default_overfit_margin?: number | null;
      default_auto_compact?: boolean;
      default_compact_threshold_pct?: number;
      default_context_limit?: number;
    }) => projects.updateSettings(projectId, settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useProjectTrainingSteps(projectId: string) {
  return useQuery({
    queryKey: ["project-training-steps", projectId],
    queryFn: () => projects.trainingSteps(projectId),
    enabled: !!projectId,
  });
}

/* ── Runs ─────────────────────────────────────────────── */

const PAGE_SIZE = 25;

export function useRuns(projectId: string) {
  return useInfiniteQuery({
    queryKey: ["runs", projectId],
    queryFn: ({ pageParam = 0 }) => runs.list(projectId, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    enabled: !!projectId,
  });
}

export function useRun(projectId: string, runId: string) {
  return useQuery({
    queryKey: ["runs", projectId, runId],
    queryFn: () => runs.get(projectId, runId),
    enabled: !!projectId && !!runId,
    refetchInterval: 3000,
  });
}

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...body }: { projectId: string; provider: string; model: string; credential_id?: string; max_iterations?: number }) =>
      runs.create(projectId, body),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["runs", vars.projectId] }),
  });
}

export function useRunAction(projectId: string, runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: RunAction) => runs.action(projectId, runId, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
    },
  });
}

export function useUpdateRunSettings(projectId: string, runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: { auto_approve?: boolean; auto_continue?: boolean; max_iterations?: number; stop_requested?: boolean; provider?: string; model?: string; credential_id?: string; overfit_floor?: number | null; overfit_margin?: number | null; auto_compact?: boolean; compact_threshold_pct?: number; context_limit?: number }) =>
      runs.updateSettings(projectId, runId, settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
    },
  });
}

export function useAgentSteps(projectId: string, runId: string) {
  return useInfiniteQuery({
    queryKey: ["agent-steps", runId],
    queryFn: ({ pageParam = 0 }) => runs.agentSteps(projectId, runId, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    enabled: !!projectId && !!runId,
    refetchInterval: 5000,
  });
}

export function useTrainingSteps(projectId: string, runId: string) {
  return useInfiniteQuery({
    queryKey: ["training-steps", runId],
    queryFn: ({ pageParam = 0 }) => runs.trainingSteps(projectId, runId, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    enabled: !!projectId && !!runId,
    refetchInterval: 5000,
  });
}

export function useChartData(projectId: string, runId: string) {
  return useQuery({
    queryKey: ["chart-data", runId],
    queryFn: () => runs.chartData(projectId, runId),
    enabled: !!projectId && !!runId,
    refetchInterval: 10000,
  });
}

export function useGitLog(projectId: string, runId: string) {
  return useQuery({
    queryKey: ["git-log", runId],
    queryFn: () => runs.gitLog(projectId, runId),
    enabled: !!projectId && !!runId,
  });
}

export function useCheckpointRestart(projectId: string, runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ iteration, resetTrainPy = false }: { iteration: number; resetTrainPy?: boolean }) =>
      runs.checkpointRestart(projectId, runId, iteration, resetTrainPy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
      qc.invalidateQueries({ queryKey: ["agent-steps", runId] });
      qc.invalidateQueries({ queryKey: ["training-steps", runId] });
      qc.invalidateQueries({ queryKey: ["git-log", runId] });
      qc.invalidateQueries({ queryKey: ["workspace-files", runId] });
      qc.invalidateQueries({ queryKey: ["usage-summary", runId] });
    },
  });
}

export function useProgram(projectId: string, runId: string) {
  return useQuery({
    queryKey: ["program", runId],
    queryFn: () => runs.getProgram(projectId, runId),
    enabled: !!projectId && !!runId,
  });
}

export function useWorkspaceFiles(projectId: string, runId: string) {
  return useQuery({
    queryKey: ["workspace-files", runId],
    queryFn: () => runs.workspaceFiles(projectId, runId),
    enabled: !!projectId && !!runId,
    refetchInterval: 10000,
  });
}

/* ── Notes ────────────────────────────────────────────── */

export function useNotes(runId: string) {
  return useQuery({
    queryKey: ["notes", runId],
    queryFn: () => notes.list(runId),
    enabled: !!runId,
  });
}

export function useCreateNote(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => notes.create(runId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", runId] }),
  });
}

export function useDeleteNote(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => notes.delete(runId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", runId] }),
  });
}

export function useUpdateNote(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, content }: { noteId: string; content: string }) =>
      notes.update(runId, noteId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", runId] }),
  });
}

/* ── Providers & Credentials ──────────────────────────── */

export function useProviders() {
  return useQuery({ queryKey: ["providers"], queryFn: providers.list });
}

export function useProviderModels(name: string, credentialId?: string) {
  return useQuery({
    queryKey: ["models", name, credentialId],
    queryFn: () => providers.models(name, credentialId),
    enabled: !!name,
    staleTime: 1000 * 60 * 60, // 1 hour — backend caches for 24h
  });
}

export function useRefreshModels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, credentialId }: { provider: string; credentialId?: string }) =>
      providers.refreshModels(provider, credentialId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["models", data.provider] });
    },
  });
}

export function useCredentials() {
  return useQuery({ queryKey: ["credentials"], queryFn: credentials.list });
}

export function useCreateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: credentials.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials"] }),
  });
}

export function useDeleteCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => credentials.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials"] }),
  });
}

export function useValidateCredential() {
  return useMutation({ mutationFn: (id: string) => credentials.validate(id) });
}

/* ── Usage ────────────────────────────────────────────── */

export function useUsage(runId?: string) {
  return useQuery({
    queryKey: ["usage", runId],
    queryFn: () => usage.list(runId),
    enabled: runId !== undefined,
  });
}

export function useUsageSummary(runId?: string) {
  return useQuery({
    queryKey: ["usage-summary", runId],
    queryFn: () => usage.summary(runId),
    refetchInterval: 10000,
  });
}

/* ── Compaction ───────────────────────────────────────── */

export function useContextUsage(projectId: string, runId: string) {
  return useQuery({
    queryKey: ["context-usage", runId],
    queryFn: () => runs.getContextUsage(projectId, runId),
    enabled: !!projectId && !!runId,
    refetchInterval: 30_000,
  });
}

export function useCompaction(projectId: string, runId: string) {
  return useQuery({
    queryKey: ["compaction", runId],
    queryFn: () => runs.getCompaction(projectId, runId),
    enabled: !!projectId && !!runId,
  });
}

export function useApplyCompaction(projectId: string, runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runs.applyCompaction(projectId, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compaction", runId] });
      qc.invalidateQueries({ queryKey: ["context-usage", runId] });
      qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
    },
  });
}

export function useUpdateCompaction(projectId: string, runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ summary, compactedUpTo }: { summary: string; compactedUpTo: number }) =>
      runs.updateCompaction(projectId, runId, summary, compactedUpTo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compaction", runId] });
      qc.invalidateQueries({ queryKey: ["context-usage", runId] });
      qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
    },
  });
}

export function useClearCompaction(projectId: string, runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runs.clearCompaction(projectId, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compaction", runId] });
      qc.invalidateQueries({ queryKey: ["context-usage", runId] });
      qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
    },
  });
}

/* ── Notification Channels ────────────────────────────── */

export function useChannelTypes() {
  return useQuery({ queryKey: ["channel-types"], queryFn: channels.types, staleTime: Infinity });
}

export function useChannels() {
  return useQuery({ queryKey: ["channels"], queryFn: channels.list });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: channels.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: string;
      name?: string;
      config?: Record<string, string>;
      notification_events?: NotificationEventType[];
      commands_enabled?: boolean;
      is_active?: boolean;
      linked_run_id?: string | null;
    }) => channels.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => channels.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
}

export function useTestChannel() {
  return useMutation({ mutationFn: (id: string) => channels.test(id) });
}

export function useValidateChannel() {
  return useMutation({ mutationFn: (id: string) => channels.validate(id) });
}
