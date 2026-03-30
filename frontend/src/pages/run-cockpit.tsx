import { useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRun, useAgentSteps, useTrainingSteps, useRunAction, useUsageSummary, useCreateRun, useUpdateRunSettings, useCheckpointRestart, useSetProjectBest, useContextUsage, useApplyCompaction } from "@/hooks/use-queries";
import { useRunSSE } from "@/hooks/use-sse";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard";
import { useUIStore } from "@/stores/ui-store";
import { StatusBadge } from "@/components/status-badge";
import { StepTimeline } from "@/components/step-timeline";
import { PatchReview } from "@/components/patch-review";
import { LiveLogConsole } from "@/components/live-log-console";
import { IterationChart } from "@/components/iteration-chart";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TokenDisplay } from "@/components/token-display";
import { MessageComposer } from "@/components/message-composer";
import { WorkspaceViewer } from "@/components/workspace-viewer";
import { AgentThinkingView, PhaseIndicator as AgentPhaseIndicator } from "@/components/agent-thinking";
import { TrainingInfoCard } from "@/components/training-info-card";
import { ModelSelector } from "@/components/model-selector";
import { CompactionModal } from "@/components/compaction-modal";
import { DiffCompareModal } from "@/components/diff-compare-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { NumberInput } from "@/components/number-input";
import {
  Play, Pause, Square, RotateCcw, Zap, GitBranch, Activity, Brain, Target, Hash, RefreshCw, ShieldCheck, FastForward, Bot, FileCode, Flame, BarChart3, StopCircle, Timer, TrendingDown, Rocket, Ban, Loader2, Layers, Gauge, FileText, ChevronDown, ChevronUp, Shrink, Cpu, MemoryStick, MonitorDot, AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import type { AgentStep, TrainingStep, RunAction, RunState } from "@/lib/types";

export default function RunCockpitPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const navigate = useNavigate();
  const { data: run } = useRun(projectId!, runId!);
  const agentStepsQuery = useAgentSteps(projectId!, runId!);
  const trainingStepsQuery = useTrainingSteps(projectId!, runId!);
  const agentSteps = useMemo(() => agentStepsQuery.data?.pages.flat() ?? [], [agentStepsQuery.data]);
  const trainingSteps = useMemo(() => trainingStepsQuery.data?.pages.flat() ?? [], [trainingStepsQuery.data]);
  const { data: usageSummary } = useUsageSummary(runId);
  const runAction = useRunAction(projectId!, runId!);
  const updateSettings = useUpdateRunSettings(projectId!, runId!);
  const createRun = useCreateRun();
  const checkpointRestart = useCheckpointRestart(projectId!, runId!);
  const setProjectBest = useSetProjectBest(projectId!);
  const { data: ctxUsage } = useContextUsage(projectId!, runId!);
  const applyCompaction = useApplyCompaction(projectId!, runId!);

  useRunSSE(projectId!, runId!);

  const [selectedStepId, setSelectedStepId] = useState<string>();
  const [selectedStepType, setSelectedStepType] = useState<"agent" | "training">();
  const [confirmAction, setConfirmAction] = useState<{ action: RunAction; title: string; desc: string } | null>(null);
  const [restartIteration, setRestartIteration] = useState<number | null>(null);
  const [compactionModalOpen, setCompactionModalOpen] = useState(false);
  const [diffCompareOpen, setDiffCompareOpen] = useState(false);
  const [mobileTimelineOpen, setMobileTimelineOpen] = useState(false);

  const handleAction = useCallback(
    (action: RunAction) => {
      if (action === "cancel") {
        setConfirmAction({ action: "cancel", title: "Cancel Run", desc: "Are you sure you want to cancel this run? This cannot be undone." });
        return;
      }
      if (action === "reject_patch") {
        setConfirmAction({ action: "reject_patch", title: "Reject Patch", desc: "Rejecting will re-prompt the agent for a new patch." });
        return;
      }
      runAction.mutate(action);
    },
    [runAction],
  );

  useKeyboardShortcuts(run?.state, handleAction);

  if (!run) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="glass rounded-xl p-8 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse-dot" />
          <span className="text-sm text-muted-foreground">Loading run...</span>
        </div>
      </div>
    );
  }

  const state = run.state as RunState;
  const lastAgent = agentSteps?.[0];
  const lastTraining = trainingSteps?.[0];

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* ── Left Panel: Config Summary ──────────────────── */}
      <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-border flex flex-col shrink-0 overflow-y-auto max-h-[50vh] md:max-h-none" style={{ background: "var(--sidebar)" }}>
        <div className="p-5 space-y-5">
          {/* Run Header */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <StatusBadge state={state} />
            </div>
            <p className="text-[11px] font-mono text-muted-foreground">{runId!.slice(0, 8)}</p>
          </div>

          <div className="sep-gradient" />

          {/* Model Selector */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Model</p>
            <ModelSelector
              provider={run.provider}
              model={run.model}
              credentialId={run.credential_id ?? undefined}
              onProviderChange={(v) => updateSettings.mutate({ provider: v, model: "" })}
              onModelChange={(v) => updateSettings.mutate({ model: v })}
              onCredentialChange={(v) => updateSettings.mutate({ credential_id: v })}
            />
          </div>

          {/* Phase Indicator */}
          {!["idle", "done", "failed", "canceled"].includes(state) && (
            <PhaseIndicator state={state} />
          )}

          <div className="sep-gradient" />

          {/* Stats */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Metrics</p>
            <StatRow icon={<Hash className="h-3.5 w-3.5" />} label="Iteration" value={run.max_iterations > 0 ? `${run.iteration} / ${run.max_iterations}` : String(run.iteration)} />
            <StatRow icon={<Target className="h-3.5 w-3.5 text-emerald-400" />} label="Best val_bpb" value={run.best_val_bpb?.toFixed(4) ?? "—"} highlight={!!run.best_val_bpb} />
            {lastTraining?.val_bpb != null && (
              <StatRow icon={<Activity className="h-3.5 w-3.5 text-cyan-400" />} label="Last val_bpb" value={lastTraining.val_bpb.toFixed(4)} />
            )}
          </div>

          <div className="sep-gradient" />

          {/* Action Buttons */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Actions</p>
            {state === "idle" && (
              <ActionBtn icon={<Play />} label="Start Run" onClick={() => handleAction("start")} accent="emerald" />
            )}
            {state === "awaiting_next_action" && (
              <ActionBtn icon={<Zap />} label="Wake Agent" shortcut="W" onClick={() => handleAction("continue")} accent="cyan" />
            )}
            {["awaiting_agent", "awaiting_patch_review", "awaiting_next_action"].includes(state) && (
              <ActionBtn icon={<Pause />} label="Pause" shortcut="P" onClick={() => handleAction("pause")} />
            )}
            {state === "paused" && (
              <ActionBtn icon={<Play />} label="Resume" onClick={() => handleAction("resume")} accent="cyan" />
            )}
            {state === "awaiting_next_action" && (
              <ActionBtn icon={<Square />} label="Stop (Done)" onClick={() => handleAction("stop")} />
            )}
            {!["idle", "done", "failed", "canceled", "awaiting_next_action"].includes(state) && !run.stop_requested && (
              <ActionBtn
                icon={<StopCircle />}
                label="Stop After This Iteration"
                onClick={() => updateSettings.mutate({ stop_requested: true })}
              />
            )}
            {run.stop_requested && !["done", "failed", "canceled"].includes(state) && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <StopCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] text-amber-400 font-medium">Stopping after iteration</span>
                <button
                  className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => updateSettings.mutate({ stop_requested: false })}
                >undo</button>
              </div>
            )}
            {!["done", "failed", "canceled"].includes(state) && (
              <ActionBtn icon={<RotateCcw />} label="Cancel Run" onClick={() => handleAction("cancel")} accent="red" />
            )}
            {["done", "failed", "canceled"].includes(state) && (
              <ActionBtn
                icon={<RefreshCw />}
                label="Reset & Rerun (Same Config)"
                accent="cyan"
                onClick={() => {
                  createRun.mutate(
                    {
                      projectId: projectId!,
                      provider: run.provider,
                      model: run.model,
                      credential_id: run.credential_id ?? undefined,
                    },
                    {
                      onSuccess: (newRun) =>
                        navigate(`/projects/${projectId}/runs/${newRun.id}`),
                    },
                  );
                }}
              />
            )}
          </div>

          <div className="sep-gradient" />

          {/* Automation Toggles */}
          {!["done", "failed", "canceled"].includes(state) && (
            <div className="space-y-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Automation</p>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Auto-approve</span>
                </div>
                <Switch
                  checked={run.auto_approve}
                  onCheckedChange={(checked) => updateSettings.mutate({ auto_approve: checked })}
                />
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FastForward className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Auto-continue</span>
                </div>
                <Switch
                  checked={run.auto_continue}
                  onCheckedChange={(checked) => updateSettings.mutate({ auto_continue: checked })}
                />
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Timer className="h-3.5 w-3.5 text-violet-400" />
                  <span>Max iterations</span>
                </div>
                <NumberInput
                  integer
                  className="w-16 h-7 text-xs text-right font-mono bg-muted/50 border-border"
                  value={run.max_iterations || ""}
                  placeholder="∞"
                  onCommit={(val) => {
                    updateSettings.mutate({ max_iterations: val ?? 0 });
                  }}
                />
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                  <span>Overfit floor</span>
                </div>
                <NumberInput
                  step={0.001}
                  min={0}
                  className="w-20 h-7 text-xs text-right font-mono bg-muted/50 border-border"
                  value={run.overfit_floor}
                  placeholder="none"
                  onCommit={(val) => {
                    updateSettings.mutate({ overfit_floor: val });
                  }}
                />
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Target className="h-3.5 w-3.5 text-amber-400" />
                  <span>Overfit margin</span>
                </div>
                <NumberInput
                  step={0.01}
                  min={0}
                  className="w-20 h-7 text-xs text-right font-mono bg-muted/50 border-border"
                  value={run.overfit_margin}
                  placeholder="none"
                  onCommit={(val) => {
                    updateSettings.mutate({ overfit_margin: val });
                  }}
                />
              </div>
              <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                  <span>Max consec. failures</span>
                </div>
                <NumberInput
                  integer
                  min={1}
                  className="w-16 h-7 text-xs text-right font-mono bg-muted/50 border-border"
                  value={run.max_consecutive_failures}
                  placeholder="6"
                  onCommit={(val) => {
                    updateSettings.mutate({ max_consecutive_failures: val ?? 6 });
                  }}
                />
              </div>

              <div className="mt-3 pt-3 border-t border-border space-y-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Context</p>

                {/* Context usage bar */}
                {ctxUsage && (
                  <div className="px-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground font-medium">
                        {(ctxUsage.prompt_tokens / 1000).toFixed(1)}k{" / "}
                        {(ctxUsage.context_limit / 1000).toFixed(0)}k tokens
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          ctxUsage.usage_pct >= 80 ? "text-red-400" : ctxUsage.usage_pct >= ctxUsage.threshold_pct ? "text-amber-400" : "text-emerald-400"
                        }`}
                      >
                        {ctxUsage.usage_pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-border/30 overflow-hidden">
                      {/* Threshold marker */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-amber-400/50 z-10"
                        style={{ left: `${Math.min(ctxUsage.threshold_pct, 100)}%` }}
                      />
                      {/* Fill */}
                      <motion.div
                        className={`h-full rounded-full ${
                          ctxUsage.usage_pct >= 80
                            ? "bg-gradient-to-r from-red-500 to-red-400"
                            : ctxUsage.usage_pct >= ctxUsage.threshold_pct
                              ? "bg-gradient-to-r from-amber-500 to-amber-400"
                              : "bg-gradient-to-r from-emerald-600 to-emerald-400"
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(ctxUsage.usage_pct, 100)}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                    {ctxUsage.compacted && (
                      <div className="flex items-center gap-1 text-[10px] text-orange-400/70">
                        <Layers className="h-3 w-3" />
                        <span>{ctxUsage.memory_count} memories compacted</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Auto-compact + threshold */}
                <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent transition-colors">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5 text-orange-400" />
                    <span>Auto-compact</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.auto_compact && (
                      <NumberInput
                        integer
                        min={10}
                        max={95}
                        className="w-14 h-6 text-[10px] text-right font-mono bg-muted/50 border-border"
                        value={run.compact_threshold_pct}
                        placeholder="50"
                        onCommit={(val) => updateSettings.mutate({ compact_threshold_pct: val ?? 50 })}
                      />
                    )}
                    <Switch
                      checked={run.auto_compact}
                      onCheckedChange={(checked) => updateSettings.mutate({ auto_compact: checked })}
                    />
                  </div>
                </div>

                {/* Compact Now button */}
                {(ctxUsage ? ctxUsage.memory_count > 5 : run.iteration > 5) && (
                  <button
                    onClick={() => {
                      applyCompaction.mutate(undefined, {
                        onSuccess: () => {
                          toast.success("Context compacted successfully");
                          setCompactionModalOpen(true);
                        },
                        onError: (err: Error) => toast.error(`Compaction failed: ${err.message}`),
                      });
                    }}
                    disabled={applyCompaction.isPending || ctxUsage?.compacting}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-all
                      bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 active:scale-[0.97]
                      disabled:opacity-40 disabled:pointer-events-none border border-orange-500/20 hover:border-orange-500/30"
                  >
                    {(applyCompaction.isPending || ctxUsage?.compacting) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Shrink className="h-3.5 w-3.5" />
                    )}
                    <span>{(applyCompaction.isPending || ctxUsage?.compacting) ? "Compacting..." : "Compact Now"}</span>
                  </button>
                )}

                {/* Compaction status */}
                {run.compacted_up_to && (
                  <button
                    onClick={() => setCompactionModalOpen(true)}
                    className="w-full text-left py-1.5 px-2 rounded-md hover:bg-accent transition-colors group"
                  >
                    <div className="flex items-center gap-2 text-xs text-orange-400/80">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Compacted to iter {run.compacted_up_to}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground group-hover:text-muted-foreground">review →</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="sep-gradient" />

          {/* Token Usage Summary */}
          {usageSummary && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Usage</p>
              <TokenDisplay
                prompt={usageSummary.total_prompt_tokens}
                completion={usageSummary.total_completion_tokens}
                cost={usageSummary.total_estimated_cost}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5 font-mono">{usageSummary.step_count} agent calls</p>
            </div>
          )}

          <div className="sep-gradient" />

          {/* Message Composer */}
          {!["done", "failed", "canceled"].includes(state) && (
            <MessageComposer runId={runId!} />
          )}

          <div className="sep-gradient" />

          {/* Workspace Files */}
          <WorkspaceViewer projectId={projectId!} runId={runId!} />
        </div>
      </div>

      {/* ── Center Panel: Active Step ────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-grid min-h-0">
        <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
          <IterationChart projectId={projectId!} runId={runId!} bestValBpb={run.best_val_bpb} />
          <CollapsibleActivity state={state}>
            <AnimatePresence mode="wait">
              <motion.div
                key={state}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <CenterContent
                  state={state}
                  lastAgent={lastAgent}
                  lastTraining={lastTraining}
                  onAction={handleAction}
                  projectId={projectId!}
                  runId={runId!}
                  iteration={run.iteration}
                  bestValBpb={run.best_val_bpb}
                  model={`${run.provider}/${run.model}`}
                  errorMessage={run.error_message}
                  machineInfo={run.machine_info}
                />
              </motion.div>
            </AnimatePresence>
          </CollapsibleActivity>
        </div>
      </div>

      {/* ── Right Panel: Step Timeline ───────────────────── */}
      <div className="hidden md:flex w-72 border-l border-border shrink-0 flex-col overflow-hidden" style={{ background: "var(--sidebar)" }}>
        <StepTimeline
          agentSteps={agentSteps}
          trainingSteps={trainingSteps}
          selectedId={selectedStepId}
          onSelect={(id, type) => { setSelectedStepId(id); setSelectedStepType(type); }}
          onRestartFromIteration={(iteration) => setRestartIteration(iteration)}
          onCompare={() => setDiffCompareOpen(true)}
          onSetProjectBest={(stepId) => {
            setProjectBest.mutate(stepId, {
              onSuccess: (project) => {
                toast.success(`Project best updated to ${project.best_val_bpb?.toFixed(4)} (iter #${project.best_iteration})`);
              },
              onError: (err) => {
                toast.error(`Failed to set project best: ${err.message}`);
              },
            });
          }}
          hasMore={
            (agentStepsQuery.hasNextPage ?? false) || (trainingStepsQuery.hasNextPage ?? false)
          }
          isFetchingMore={agentStepsQuery.isFetchingNextPage || trainingStepsQuery.isFetchingNextPage}
          onLoadMore={() => {
            if (agentStepsQuery.hasNextPage) agentStepsQuery.fetchNextPage();
            if (trainingStepsQuery.hasNextPage) trainingStepsQuery.fetchNextPage();
          }}
        />
      </div>

      {/* ── Mobile Timeline FAB + Drawer ─────────────── */}
      <button
        onClick={() => setMobileTimelineOpen(true)}
        className="fixed bottom-5 right-5 z-40 md:hidden h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Open step timeline"
      >
        <Layers className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {mobileTimelineOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50 md:hidden"
              onClick={() => setMobileTimelineOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-y-0 right-0 w-[min(320px,85vw)] z-50 md:hidden border-l border-border flex flex-col overflow-hidden"
              style={{ background: "var(--sidebar)" }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <span className="text-sm font-medium">Step Timeline</span>
                <button
                  onClick={() => setMobileTimelineOpen(false)}
                  className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <StepTimeline
                agentSteps={agentSteps}
                trainingSteps={trainingSteps}
                selectedId={selectedStepId}
                onSelect={(id, type) => { setSelectedStepId(id); setSelectedStepType(type); setMobileTimelineOpen(false); }}
                onRestartFromIteration={(iteration) => { setRestartIteration(iteration); setMobileTimelineOpen(false); }}
                onCompare={() => { setDiffCompareOpen(true); setMobileTimelineOpen(false); }}
                onSetProjectBest={(stepId) => {
                  setProjectBest.mutate(stepId, {
                    onSuccess: (project) => {
                      toast.success(`Project best updated to ${project.best_val_bpb?.toFixed(4)} (iter #${project.best_iteration})`);
                    },
                    onError: (err) => {
                      toast.error(`Failed to set project best: ${err.message}`);
                    },
                  });
                }}
                hasMore={
                  (agentStepsQuery.hasNextPage ?? false) || (trainingStepsQuery.hasNextPage ?? false)
                }
                isFetchingMore={agentStepsQuery.isFetchingNextPage || trainingStepsQuery.isFetchingNextPage}
                onLoadMore={() => {
                  if (agentStepsQuery.hasNextPage) agentStepsQuery.fetchNextPage();
                  if (trainingStepsQuery.hasNextPage) trainingStepsQuery.fetchNextPage();
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Training detail drawer */}
      {selectedStepId && selectedStepType === "training" && (
        <TrainingDetailPanel
          step={trainingSteps.find((s) => s.id === selectedStepId)}
          onClose={() => { setSelectedStepId(undefined); setSelectedStepType(undefined); }}
        />
      )}

      {/* Agent detail drawer */}
      {selectedStepId && selectedStepType === "agent" && (
        <AgentDetailPanel
          step={agentSteps.find((s) => s.id === selectedStepId)}
          onClose={() => { setSelectedStepId(undefined); setSelectedStepType(undefined); }}
        />
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          open
          title={confirmAction.title}
          description={confirmAction.desc}
          variant={confirmAction.action === "cancel" ? "destructive" : "default"}
          confirmLabel={confirmAction.action === "cancel" ? "Cancel Run" : "Reject"}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => runAction.mutate(confirmAction.action)}
        />
      )}

      {/* Checkpoint restart dialog */}
      {restartIteration !== null && (
        <RestartDialog
          iteration={restartIteration}
          onClose={() => setRestartIteration(null)}
          onConfirm={(resetTrainPy) => {
            checkpointRestart.mutate({ iteration: restartIteration, resetTrainPy });
            setRestartIteration(null);
          }}
        />
      )}

      {/* Compaction review modal */}
      <CompactionModal
        open={compactionModalOpen}
        onClose={() => setCompactionModalOpen(false)}
        projectId={projectId!}
        runId={runId!}
      />

      {/* Diff comparison modal */}
      <DiffCompareModal
        open={diffCompareOpen}
        onClose={() => setDiffCompareOpen(false)}
        projectId={projectId!}
        runId={runId!}
      />
    </div>
  );
}

/* ── Collapsible wrapper for the activity section ──────── */

const ACTIVITY_META: Record<string, { icon: typeof Brain; label: string; iconBg: string; iconColor: string }> = {
  agent_running:        { icon: Brain,      label: "Agent Working",        iconBg: "bg-cyan-500/10",    iconColor: "text-cyan-400"    },
  awaiting_agent:       { icon: Brain,      label: "Agent Working",        iconBg: "bg-cyan-500/10",    iconColor: "text-cyan-400"    },
  awaiting_patch_review:{ icon: FileCode,   label: "Patch Review",         iconBg: "bg-amber-500/10",   iconColor: "text-amber-400"   },
  training_running:     { icon: Flame,      label: "Training",             iconBg: "bg-violet-500/10",  iconColor: "text-violet-400"  },
  training_finished:    { icon: Activity,   label: "Training Complete",    iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
  awaiting_next_action: { icon: Zap,        label: "Awaiting Action",      iconBg: "bg-amber-500/10",   iconColor: "text-amber-400"   },
  idle:                 { icon: Rocket,     label: "Ready",                iconBg: "bg-cyan-500/10",    iconColor: "text-cyan-400"    },
  preparing:            { icon: Loader2,    label: "Preparing",            iconBg: "bg-cyan-500/10",    iconColor: "text-cyan-400"    },
  done:                 { icon: Target,     label: "Run Complete",         iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
  failed:               { icon: RotateCcw,  label: "Failed",               iconBg: "bg-red-500/10",     iconColor: "text-red-400"     },
  canceled:             { icon: Ban,        label: "Canceled",             iconBg: "bg-zinc-500/10",    iconColor: "text-zinc-400"    },
  paused:               { icon: Pause,      label: "Paused",               iconBg: "bg-cyan-500/10",    iconColor: "text-cyan-400"    },
};

function CollapsibleActivity({ state, children }: { state: RunState; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = ACTIVITY_META[state] ?? { icon: Activity, label: state.replace(/_/g, " "), iconBg: "bg-cyan-500/10", iconColor: "text-cyan-400" };
  const Icon = meta.icon;

  // For agent states, read phase info to display in the header
  const { agentPhase, agentStream } = useUIStore();
  const isAgent = state === "agent_running" || state === "awaiting_agent";
  const effectivePhase = isAgent
    ? (agentPhase === "idle" && !agentStream ? undefined : agentPhase === "idle" ? "thinking" : agentPhase)
    : undefined;

  // Dynamic subtitle for the header
  let subtitle: string | undefined;
  if (isAgent && effectivePhase) {
    subtitle = effectivePhase === "thinking" ? "Analyzing & reasoning..." : effectivePhase === "coding" ? "Generating patch..." : "Patch complete";
  } else if (state === "training_running") {
    subtitle = "Training in progress";
  }

  return (
    <div className="glass rounded-xl overflow-hidden mb-6 transition-all duration-300">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-accent transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className={`h-7 w-7 rounded-lg ${meta.iconBg} flex items-center justify-center`}>
            <Icon className={`h-3.5 w-3.5 ${meta.iconColor}`} />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium text-foreground/90">{meta.label}</span>
            {subtitle && (
              <span className="text-[11px] text-muted-foreground font-mono">{subtitle}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAgent && effectivePhase && (
            <AgentPhaseIndicator phase={effectivePhase} />
          )}
          {state === "training_running" && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse-dot" />
              <span className="text-[9px] font-medium text-violet-400 uppercase tracking-wider">Running</span>
            </div>
          )}
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Center panel content by state ─────────────────────── */

function CenterContent({
  state, lastAgent, lastTraining, onAction, projectId, runId, iteration, bestValBpb, model, errorMessage, machineInfo,
}: {
  state: RunState;
  lastAgent?: AgentStep | null;
  lastTraining?: TrainingStep | null;
  onAction: (a: RunAction) => void;
  projectId: string;
  runId: string;
  iteration: number;
  bestValBpb: number | null;
  model: string;
  errorMessage?: string | null;
  machineInfo?: string | null;
}) {
  // Subscribe to streaming state here (not in the parent) so only this
  // component re-renders on every agent chunk, not the entire cockpit.
  const { agentStream, agentPhase } = useUIStore();

  if (state === "awaiting_patch_review" && lastAgent?.patch) {
    return (
      <PatchReview
        step={lastAgent}
        onApprove={() => onAction("approve_patch")}
        onReject={() => onAction("reject_patch")}
      />
    );
  }

  if (state === "agent_running" || state === "awaiting_agent") {
    // agentPhase === "idle" means we haven't received a phase from the backend
    // yet (e.g. page just loaded, SSE not connected). Show a generic card.
    if (agentPhase === "idle" && !agentStream) {
      return (
        <div className="p-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
            <Brain className="h-6 w-6 text-cyan-400 animate-pulse-dot" />
          </div>
          <p className="text-sm font-medium mb-1">Agent is working</p>
          <p className="text-xs text-muted-foreground">Waiting for stream data…</p>
          {state === "agent_running" && (
            <button
              onClick={() => onAction("force_fail")}
              className="mt-4 text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
            >
              Stuck? Force reset
            </button>
          )}
        </div>
      );
    }
    return <AgentThinkingView stream={agentStream} phase={agentPhase === "idle" ? undefined : agentPhase} />;
  }

  if (state === "training_running") {
    return (
      <div className="space-y-4">
        <TrainingInfoCard iteration={iteration} bestValBpb={bestValBpb} model={model} />
        <LiveLogConsole onCancel={() => onAction("cancel")} />
      </div>
    );
  }

  if (state === "training_finished" && lastTraining) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Activity className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium">Training Complete</p>
            {lastTraining.improved != null && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono ${
                lastTraining.improved
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}>
                {lastTraining.improved ? "Improved — Kept" : "No Improvement — Reverted"}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-muted/50 border border-border p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">val_bpb</p>
            <p className="text-2xl font-mono font-bold text-emerald-400">{lastTraining.val_bpb?.toFixed(4) ?? "—"}</p>
          </div>
          {lastTraining.commit_sha && (
            <div className="rounded-lg bg-muted/50 border border-border p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Commit</p>
              <p className="text-sm font-mono flex items-center gap-2 mt-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                {lastTraining.commit_sha.slice(0, 7)}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state === "awaiting_next_action") {
    return (
      <div className="space-y-4">
        {/* Last training result summary */}
        {lastTraining && (
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                lastTraining.status === "failed"
                  ? "bg-red-500/10"
                  : lastTraining.improved
                    ? "bg-emerald-500/10"
                    : "bg-amber-500/10"
              }`}>
                <BarChart3 className={`h-4 w-4 ${
                  lastTraining.status === "failed"
                    ? "text-red-400"
                    : lastTraining.improved
                      ? "text-emerald-400"
                      : "text-amber-400"
                }`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Training #{lastTraining.iteration} Result</p>
                <p className="text-[11px] text-muted-foreground">Iteration {lastTraining.iteration} completed</p>
              </div>
              {lastTraining.improved != null && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono ${
                  lastTraining.improved
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {lastTraining.improved ? "Improved" : "Reverted"}
                </span>
              )}
              {lastTraining.status === "failed" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-red-500/10 text-red-400 border border-red-500/20">
                  Failed
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/50 border border-border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">val_bpb</p>
                <p className={`text-lg font-mono font-bold ${
                  lastTraining.improved ? "text-emerald-400" : lastTraining.val_bpb != null ? "text-foreground" : "text-muted-foreground"
                }`}>{lastTraining.val_bpb?.toFixed(4) ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-muted/50 border border-border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Best</p>
                <p className="text-lg font-mono font-bold text-emerald-400">{bestValBpb?.toFixed(4) ?? "—"}</p>
              </div>
              {lastTraining.commit_sha && (
                <div className="rounded-lg bg-muted/50 border border-border p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Commit</p>
                  <p className="text-sm font-mono flex items-center gap-1.5 mt-1">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    {lastTraining.commit_sha.slice(0, 7)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wake agent CTA */}
        <div className="p-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Zap className="h-6 w-6 text-amber-400" />
          </div>
          <p className="text-base font-medium mb-1">Ready for next iteration</p>
          <p className="text-xs text-muted-foreground mb-6">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono text-[11px]">W</kbd> to wake the agent
          </p>
          <Button
            onClick={() => onAction("continue")}
            className="gap-2 bg-amber-600/80 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/10 active:scale-95 transition-all"
          >
            <Zap className="h-4 w-4" /> Wake Agent
          </Button>
        </div>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
          <Target className="h-7 w-7 text-emerald-400" />
        </div>
        <p className="text-base font-medium mb-1">Run Complete</p>
        <p className="text-xs text-muted-foreground mb-6">All iterations finished successfully</p>
        <Button
          onClick={() => onAction("force_continue")}
          className="gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/10 active:scale-95 transition-all"
        >
          <Play className="h-4 w-4" /> Continue Run
        </Button>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <RotateCcw className="h-7 w-7 text-red-400" />
        </div>
        <p className="text-base font-medium text-red-400 mb-1">Run Failed</p>
        {errorMessage ? (
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto font-mono bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3 text-left break-words whitespace-pre-wrap">{errorMessage}</p>
        ) : (
          <p className="text-xs text-muted-foreground mb-6">Check the step timeline for error details</p>
        )}
        <Button
          onClick={() => onAction("retry")}
          className="gap-2 bg-cyan-600/80 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/10 active:scale-95 transition-all"
        >
          <RefreshCw className="h-4 w-4" /> Retry Last Step
        </Button>
      </div>
    );
  }

  if (state === "idle") {
    return (
      <div className="p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Rocket className="h-7 w-7 text-primary" />
        </div>
        <p className="text-base font-medium mb-1">Ready to Launch</p>
        <p className="text-xs text-muted-foreground mb-6">
          Configure the model and settings in the sidebar, then start the run.
        </p>
        <Button
          onClick={() => onAction("start")}
          className="gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/10 active:scale-95 transition-all"
        >
          <Play className="h-4 w-4" /> Start Run
        </Button>
      </div>
    );
  }

  if (state === "canceled") {
    return (
      <div className="p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Ban className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-base font-medium mb-1">Run Canceled</p>
        <p className="text-xs text-muted-foreground mb-6">This run was stopped before completing.</p>
        <Button
          onClick={() => onAction("force_continue")}
          className="gap-2 bg-cyan-600/80 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/10 active:scale-95 transition-all"
        >
          <Play className="h-4 w-4" /> Continue Run
        </Button>
      </div>
    );
  }

  if (state === "paused") {
    return (
      <div className="p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <Pause className="h-7 w-7 text-amber-400" />
        </div>
        <p className="text-base font-medium mb-1">Run Paused</p>
        <p className="text-xs text-muted-foreground mb-6">The run is paused and waiting to be resumed.</p>
        <Button
          onClick={() => onAction("resume")}
          className="gap-2 bg-cyan-600/80 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/10 active:scale-95 transition-all"
        >
          <Play className="h-4 w-4" /> Resume
        </Button>
      </div>
    );
  }

  if (state === "preparing") {
    const hw = machineInfo ? (() => { try { return JSON.parse(machineInfo); } catch { return null; } })() : null;
    return (
      <div className="p-8">
        <div className="text-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="h-7 w-7 text-cyan-400 animate-spin" />
          </div>
          <p className="text-base font-medium mb-1">Preparing Workspace</p>
          <p className="text-xs text-muted-foreground">
            {hw ? "Environment ready — machine assessed" : "Setting up environment, installing dependencies…"}
          </p>
        </div>
        {hw && (
          <div className="rounded-xl border bg-card p-4 max-w-sm mx-auto space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Machine Profile</p>
            <div className="flex items-center gap-2.5 text-sm">
              <MonitorDot className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">OS</span>
              <span className="ml-auto font-mono text-xs">{hw.os}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">CPU</span>
              <span className="ml-auto font-mono text-xs">{hw.cpu_cores} cores</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <MemoryStick className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">RAM</span>
              <span className="ml-auto font-mono text-xs">{hw.ram_gb} GB</span>
            </div>
            {hw.gpus && hw.gpus.length > 0 ? hw.gpus.map((g: { name: string; vram_mb?: number }, i: number) => (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-muted-foreground">GPU</span>
                <span className="ml-auto font-mono text-xs">{g.name}{g.vram_mb ? ` (${(g.vram_mb / 1024).toFixed(1)} GB)` : ""}</span>
              </div>
            )) : (
              <div className="flex items-center gap-2.5 text-sm">
                <Zap className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <span className="text-muted-foreground/60">No GPU — CPU only</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Other / unknown states
  return (
    <div className="p-8 text-center">
      <p className="text-sm text-muted-foreground capitalize">{state.replace(/_/g, " ")}</p>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────── */

function StatRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-accent transition-colors">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className={`text-xs font-mono font-medium ${highlight ? "text-emerald-400" : ""}`}>{value}</span>
    </div>
  );
}

function ActionBtn({
  icon, label, onClick, shortcut, accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  shortcut?: string;
  accent?: "emerald" | "cyan" | "red";
}) {
  const accentStyles = {
    emerald: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20",
    cyan: "bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/20",
    red: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20",
  };
  const cls = accent
    ? accentStyles[accent]
    : "bg-muted/50 hover:bg-accent text-muted-foreground border-border";
  return (
    <button
      className={`w-full flex items-center gap-2.5 h-8 px-3 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-[0.98] ${cls}`}
      onClick={onClick}
    >
      <span className="h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      {label}
      {shortcut && (
        <kbd className="ml-auto px-1 py-0.5 text-[10px] bg-black/30 rounded font-mono">{shortcut}</kbd>
      )}
    </button>
  );
}

/* ── Phase Indicator ──────────────────────────────────── */

import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const PHASES = [
  { key: "agent",    label: "Agent",    icon: Bot,      states: ["preparing", "awaiting_agent", "agent_running"] },
  { key: "patch",    label: "Patch",    icon: FileCode,  states: ["awaiting_patch_review", "patch_approved"] },
  { key: "train",    label: "Train",    icon: Flame,     states: ["training_running", "training_finished"] },
  { key: "evaluate", label: "Evaluate", icon: BarChart3, states: ["awaiting_next_action"] },
] as const;

function PhaseIndicator({ state }: { state: RunState }) {
  const activeIdx = PHASES.findIndex((p) => p.states.includes(state as never));

  return (
    <div className="px-1">
      {/* Step dots + connecting line */}
      <div className="relative flex items-center justify-between">
        {/* Background track */}
        <div className="absolute top-3 left-3 right-3 h-px -translate-y-1/2 bg-border/20" />
        {/* Filled track up to active */}
        {activeIdx > 0 && (
          <div
            className="absolute top-3 left-3 h-px -translate-y-1/2 bg-emerald-500/40 transition-all duration-500"
            style={{ width: `calc(${(activeIdx / (PHASES.length - 1)) * 100}% - 24px)` }}
          />
        )}

        {PHASES.map((phase, i) => {
          const isActive = i === activeIdx;
          const isPast = activeIdx >= 0 && i < activeIdx;
          const Icon = phase.icon;
          return (
            <Tooltip key={phase.key}>
              <TooltipTrigger render={<div className="relative z-10 flex flex-col items-center gap-1.5" />}>
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isActive
                        ? "bg-violet-500/20 ring-2 ring-violet-400/50 ring-offset-1 ring-offset-background"
                        : isPast
                          ? "bg-emerald-500/15"
                          : "bg-muted/60"
                    }`}
                  >
                    <Icon
                      className={`h-3 w-3 ${
                        isActive
                          ? "text-violet-400"
                          : isPast
                            ? "text-emerald-400/70"
                            : "text-muted-foreground"
                      }`}
                    />
                    {isActive && (
                      <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-violet-400 animate-pulse-dot" />
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-medium leading-none ${
                      isActive
                        ? "text-violet-400"
                        : isPast
                          ? "text-emerald-400/50"
                          : "text-muted-foreground"
                    }`}
                  >
                    {phase.label}
                  </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {phase.label}{isActive ? " (current)" : isPast ? " (done)" : ""}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

/* ── Training Detail Panel ────────────────────────────── */

import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Terminal, CheckCircle2, XCircle } from "lucide-react";

function TrainingDetailPanel({ step, onClose }: { step?: TrainingStep; onClose: () => void }) {
  if (!step) return null;

  const hasStdout = step.stdout_log && step.stdout_log.trim().length > 0;
  const hasStderr = step.stderr_log && step.stderr_log.trim().length > 0;

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="fixed inset-y-0 right-0 w-full sm:w-[520px] z-50 border-l border-border flex flex-col"
      style={{ background: "var(--sidebar)" }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
            step.status === "failed" ? "bg-red-500/10" :
            step.improved ? "bg-emerald-500/10" : "bg-amber-500/10"
          }`}>
            {step.status === "failed" ? (
              <XCircle className="h-4 w-4 text-red-400" />
            ) : step.improved ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">Training #{step.iteration}</p>
            <p className="text-[11px] text-muted-foreground">
              {step.status === "failed" ? "Failed" :
               step.status === "running" ? "Running..." :
               step.improved ? "Improved" : "No improvement"}
              {step.exit_code != null && ` · exit ${step.exit_code}`}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Metrics row */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-4 shrink-0">
        <div className="flex-1 rounded-lg bg-muted/50 border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">val_bpb</p>
          <p className={`text-lg font-mono font-bold ${step.improved ? "text-emerald-400" : step.val_bpb != null ? "text-foreground" : "text-muted-foreground"}`}>
            {step.val_bpb?.toFixed(4) ?? "—"}
          </p>
        </div>
        {step.commit_sha && (
          <div className="flex-1 rounded-lg bg-muted/50 border border-border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Commit</p>
            <p className="text-sm font-mono flex items-center gap-1.5 mt-1">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              {step.commit_sha.slice(0, 7)}
            </p>
          </div>
        )}
      </div>

      {/* Error summary for failed training */}
      {step.status === "failed" && (
        <div className="px-5 py-3 border-b border-red-500/20 bg-red-950/20 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-xs font-medium text-red-400">Training Failed</p>
            {step.exit_code != null && (
              <span className="ml-auto text-[11px] font-mono text-red-400/60">exit code {step.exit_code}</span>
            )}
          </div>
          {step.stderr_log && step.stderr_log.trim().length > 0 && (
            <pre className="text-[11px] font-mono leading-relaxed text-red-300/80 bg-red-950/30 rounded-md p-2.5 border border-red-500/10 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {step.stderr_log.trim().split("\n").slice(-10).join("\n")}
            </pre>
          )}
        </div>
      )}

      {/* Log tabs */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {hasStdout && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">stdout</p>
              </div>
              <pre className="text-[11px] font-mono leading-relaxed text-muted-foreground bg-black/30 rounded-lg p-3 border border-border overflow-x-auto whitespace-pre-wrap break-all max-h-[40vh] overflow-y-auto">
                {step.stdout_log}
              </pre>
            </div>
          )}
          {hasStderr && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">stderr</p>
              </div>
              <pre className="text-[11px] font-mono leading-relaxed text-red-300/80 bg-red-950/20 rounded-lg p-3 border border-red-500/15 overflow-x-auto whitespace-pre-wrap break-all max-h-[40vh] overflow-y-auto">
                {step.stderr_log}
              </pre>
            </div>
          )}
          {!hasStdout && !hasStderr && (
            <div className="text-center py-12">
              <Terminal className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {step.status === "running" ? "Training in progress..." : "No output recorded"}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}

/* ── Agent Detail Panel ───────────────────────────────── */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileCode2, MessageSquare, Code2, ArrowUp, ArrowDown, Copy, Check } from "lucide-react";

function AgentDetailPanel({ step, onClose }: { step?: AgentStep; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState("rationale");
  const [copied, setCopied] = useState(false);

  const tabContent: Record<string, string | undefined> = {
    rationale: step?.rationale ?? undefined,
    patch: step?.patch ?? undefined,
    prompt: step?.prompt ?? undefined,
    response: step?.response ?? undefined,
  };

  const handleCopy = useCallback(async () => {
    const text = tabContent[activeTab];
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeTab, tabContent]);

  if (!step) return null;

  const usage = step.token_usage;

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="fixed inset-y-0 right-0 w-full sm:w-[600px] z-50 border-l border-border flex flex-col"
      style={{ background: "var(--sidebar)" }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
            step.status === "failed" ? "bg-red-500/10" : "bg-cyan-500/10"
          }`}>
            {step.status === "failed" ? (
              <XCircle className="h-4 w-4 text-red-400" />
            ) : (
              <Bot className="h-4 w-4 text-cyan-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">Agent #{step.iteration}</p>
            <p className="text-[11px] text-muted-foreground font-mono">
              {step.provider}/{step.model}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Token usage metrics */}
      {usage && (
        <div className="px-5 py-3 border-b border-border flex items-center gap-3 shrink-0">
          <div className="flex-1 rounded-lg bg-muted/50 border border-border p-2.5 flex items-center gap-2">
            <ArrowUp className="h-3 w-3 text-cyan-400 shrink-0" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Input</p>
              <p className="text-sm font-mono font-semibold">{usage.prompt_tokens.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex-1 rounded-lg bg-muted/50 border border-border p-2.5 flex items-center gap-2">
            <ArrowDown className="h-3 w-3 text-emerald-400 shrink-0" />
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Output</p>
              <p className="text-sm font-mono font-semibold">{usage.completion_tokens.toLocaleString()}</p>
            </div>
          </div>
          {usage.estimated_cost > 0 && (
            <div className="flex-1 rounded-lg bg-muted/50 border border-border p-2.5">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Cost</p>
              <p className="text-sm font-mono font-semibold text-amber-400">${usage.estimated_cost.toFixed(4)}</p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="mx-5 mt-3 mb-0 flex items-center gap-2">
        <TabsList className="bg-muted/50 border border-border self-start">
          <TabsTrigger value="rationale" className="gap-1.5 text-xs">
            <MessageSquare className="h-3 w-3" /> Rationale
          </TabsTrigger>
          <TabsTrigger value="patch" className="gap-1.5 text-xs">
            <FileCode2 className="h-3 w-3" /> Patch
          </TabsTrigger>
          <TabsTrigger value="prompt" className="gap-1.5 text-xs">
            <ArrowUp className="h-3 w-3" /> Prompt
          </TabsTrigger>
          <TabsTrigger value="response" className="gap-1.5 text-xs">
            <Code2 className="h-3 w-3" /> Full Response
          </TabsTrigger>
        </TabsList>
          {tabContent[activeTab] && (
            <button
              onClick={handleCopy}
              className="h-7 px-2 rounded-md flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-all active:scale-95"
              title={copied ? "Copied" : "Copy to clipboard"}
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span className="font-mono">{copied ? "Copied" : "Copy"}</span>
            </button>
          )}
        </div>

        <TabsContent value="rationale" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-5">
              {step.rationale ? (
                <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/15 p-4">
                  <p className="text-[11px] text-cyan-400/60 uppercase tracking-wider font-medium mb-2">Agent Rationale</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{step.rationale}</p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No rationale recorded</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="patch" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-5">
              {step.patch ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileCode2 className="h-3.5 w-3.5 text-emerald-400" />
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Generated train.py</p>
                  </div>
                  <pre className="text-[11px] font-mono leading-relaxed text-muted-foreground bg-black/30 rounded-lg p-4 border border-border overflow-x-auto whitespace-pre-wrap break-all">
                    {step.patch}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileCode2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No patch generated</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="response" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-5">
              {step.response ? (
                <pre className="text-[11px] font-mono leading-relaxed text-muted-foreground bg-black/30 rounded-lg p-4 border border-border overflow-x-auto whitespace-pre-wrap break-all">
                  {step.response}
                </pre>
              ) : (
                <div className="text-center py-12">
                  <Code2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No response recorded</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="prompt" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-5">
              {step.prompt ? (
                <pre className="text-[11px] font-mono leading-relaxed text-muted-foreground bg-black/30 rounded-lg p-4 border border-border overflow-x-auto whitespace-pre-wrap break-all">
                  {step.prompt}
                </pre>
              ) : (
                <div className="text-center py-12">
                  <ArrowUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No prompt recorded</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

/* ── Restart dialog with reset train.py option ─────────── */

function RestartDialog({
  iteration,
  onClose,
  onConfirm,
}: {
  iteration: number;
  onClose: () => void;
  onConfirm: (resetTrainPy: boolean) => void;
}) {
  const [resetTrainPy, setResetTrainPy] = useState(false);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md glass border-border">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold tracking-tight">
            Restart from iteration {iteration}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            The code will be rolled back to the best checkpoint at or before iteration {iteration}. All history is preserved and the run will auto-continue from the next iteration.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-accent transition-colors cursor-pointer">
          <Switch checked={resetTrainPy} onCheckedChange={setResetTrainPy} />
          <div>
            <p className="text-sm font-medium">Reset train.py</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Restore train.py to the version before this iteration so the agent redoes it from scratch
            </p>
          </div>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(resetTrainPy)}>
            Restart from here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
