import { useState, useMemo, useRef, useCallback } from "react";
import { formatDistanceToNow } from "@/lib/format";
import { GitCommit, Bot, Cpu, Loader2, RotateCcw, History, Trophy, ChevronRight, ChevronsUpDown, GitCompareArrows } from "lucide-react";
import type { AgentStep, TrainingStep } from "@/lib/types";

/* ── Types ─────────────────────────────────────────────── */

interface IterationGroup {
  iteration: number;
  agent: AgentStep | null;
  training: TrainingStep | null;
  status: "running" | "failed" | "completed";
  created_at: string;
}

interface Props {
  agentSteps: AgentStep[];
  trainingSteps: TrainingStep[];
  selectedId?: string;
  onSelect: (id: string, type: "agent" | "training") => void;
  onRestartFromIteration?: (iteration: number) => void;
  onSetProjectBest?: (trainingStepId: string) => void;
  onCompare?: () => void;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
}

/* ── Helpers ───────────────────────────────────────────── */

function deriveGroupStatus(agent: AgentStep | null, training: TrainingStep | null): IterationGroup["status"] {
  if (agent?.status === "running" || training?.status === "running") return "running";
  if (agent?.status === "failed" || agent?.status === "timeout" || training?.status === "failed") return "failed";
  if (training?.status === "completed") return "completed";
  if (agent?.status === "completed") return "completed";
  // Agent is pending/queued — treat as running
  if (agent?.status === "pending") return "running";
  return "failed";
}

function groupByIteration(agentSteps: AgentStep[], trainingSteps: TrainingStep[]): IterationGroup[] {
  const map = new Map<number, { agent: AgentStep | null; training: TrainingStep | null }>();

  // agentSteps/trainingSteps are sorted newest-first; keep only the latest per iteration
  for (const a of agentSteps) {
    const existing = map.get(a.iteration);
    if (existing) { if (!existing.agent) existing.agent = a; }
    else map.set(a.iteration, { agent: a, training: null });
  }
  for (const t of trainingSteps) {
    const existing = map.get(t.iteration);
    if (existing) { if (!existing.training) existing.training = t; }
    else map.set(t.iteration, { agent: null, training: t });
  }

  const groups: IterationGroup[] = [];
  for (const [iteration, { agent, training }] of map) {
    const earliest = agent?.created_at && training?.created_at
      ? (agent.created_at < training.created_at ? agent.created_at : training.created_at)
      : (agent?.created_at ?? training?.created_at ?? "");

    groups.push({
      iteration,
      agent,
      training,
      status: deriveGroupStatus(agent, training),
      created_at: earliest,
    });
  }

  groups.sort((a, b) => b.iteration - a.iteration);

  // Only the top (most recent) iteration may show as "running".
  // All others: has val_bpb → completed, otherwise → failed.
  for (let i = 1; i < groups.length; i++) {
    if (groups[i].status === "running") {
      groups[i].status = groups[i].training?.val_bpb != null ? "completed" : "failed";
    }
  }

  return groups;
}

const STATUS_LABEL: Record<IterationGroup["status"], string> = {
  running: "Running",
  failed: "Failed",
  completed: "Finished",
};

const STATUS_COLOR: Record<IterationGroup["status"], string> = {
  running: "text-cyan-400",
  failed: "text-red-400",
  completed: "text-emerald-400",
};

/* ── Component ─────────────────────────────────────────── */

export function StepTimeline({ agentSteps, trainingSteps, selectedId, onSelect, onRestartFromIteration, onSetProjectBest, onCompare, hasMore, isFetchingMore, onLoadMore }: Props) {
  const groups = useMemo(() => groupByIteration(agentSteps, trainingSteps), [agentSteps, trainingSteps]);
  const totalSteps = agentSteps.length + trainingSteps.length;
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const allExpanded = groups.length > 0 && groups.every((g) => expandedSet.has(g.iteration));

  const toggleExpand = useCallback((iteration: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(iteration)) next.delete(iteration);
      else next.add(iteration);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedSet(new Set());
    } else {
      setExpandedSet(new Set(groups.map((g) => g.iteration)));
    }
  }, [allExpanded, groups]);

  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingMore) return;
      if (observer.current) observer.current.disconnect();
      if (!node || !hasMore || !onLoadMore) return;
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      });
      observer.current.observe(node);
    },
    [hasMore, isFetchingMore, onLoadMore],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Timeline</p>
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {groups.length} iteration{groups.length !== 1 ? "s" : ""} · {totalSteps} steps
          </p>
        </div>
        {groups.length > 0 && (
          <div className="flex items-center gap-0.5">
            {onCompare && agentSteps.filter((s) => s.patch).length >= 2 && (
              <button
                onClick={onCompare}
                className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-cyan-400 transition-colors"
                title="Compare iterations"
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={toggleAll}
              className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-muted-foreground transition-colors"
              title={allExpanded ? "Collapse all" : "Expand all"}
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2 space-y-0.5">
          {groups.map((group) => (
            <IterationSection
              key={group.iteration}
              group={group}
              expanded={expandedSet.has(group.iteration)}
              onToggle={() => toggleExpand(group.iteration)}
              selectedId={selectedId}
              onSelect={onSelect}
              onRestartFromIteration={onRestartFromIteration}
              onSetProjectBest={onSetProjectBest}
            />
          ))}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {isFetchingMore && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
            </div>
          )}
          {groups.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground italic">No steps yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Iteration Section ─────────────────────────────────── */

function IterationSection({
  group,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  onRestartFromIteration,
  onSetProjectBest,
}: {
  group: IterationGroup;
  expanded: boolean;
  onToggle: () => void;
  selectedId?: string;
  onSelect: (id: string, type: "agent" | "training") => void;
  onRestartFromIteration?: (iteration: number) => void;
  onSetProjectBest?: (trainingStepId: string) => void;
}) {
  const isRestarted = group.agent?.restarted_from_iteration != null;
  const score = group.training?.val_bpb;
  const improved = group.training?.improved;

  return (
    <div className="group/section">
      {/* Restart marker */}
      {isRestarted && (
        <div className="flex items-center gap-2 px-3 py-1 mb-0.5">
          <div className="h-px flex-1 bg-amber-500/30" />
          <div className="flex items-center gap-1 text-[10px] font-mono text-amber-400/80 shrink-0">
            <History className="h-3 w-3" />
            Restarted from #{group.agent!.restarted_from_iteration}
          </div>
          <div className="h-px flex-1 bg-amber-500/30" />
        </div>
      )}

      {/* Collapsed row / section header */}
      <div className={`rounded-lg transition-colors duration-150 ${
        isRestarted
          ? "bg-amber-500/[3%]"
          : "hover:bg-accent"
      }`}>
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
        >
          {/* Chevron */}
          <ChevronRight className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />

          {/* Status dot */}
          <StatusIndicator status={group.status} />

          {/* Iteration label */}
          <span className="text-[11px] font-semibold tracking-tight text-foreground">
            #{group.iteration}
          </span>

          {/* Status text */}
          <span className={`text-[10px] font-medium ${STATUS_COLOR[group.status]}`}>
            {STATUS_LABEL[group.status]}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Score (always visible in collapsed) */}
          {score != null && (
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[11px] font-mono font-medium ${improved ? "text-emerald-400" : "text-foreground/50"}`}>
                {score.toFixed(4)}
              </span>
              {improved != null && (
                <span className={`text-[9px] font-bold ${improved ? "text-emerald-500/70" : "text-red-500/60"}`}>
                  {improved ? "▲" : "▼"}
                </span>
              )}
            </div>
          )}

          {/* Hover actions (restart / trophy) */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/section:opacity-100 transition-opacity">
            {onRestartFromIteration && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onRestartFromIteration(group.iteration);
                }}
                title={`Restart from iteration ${group.iteration}`}
                className="h-5 w-5 rounded flex items-center justify-center hover:bg-amber-500/20 text-muted-foreground hover:text-amber-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
              </div>
            )}
            {onSetProjectBest && group.training && score != null && group.training.commit_sha && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onSetProjectBest(group.training!.id);
                }}
                title={`Set as project best (${score.toFixed(4)})`}
                className="h-5 w-5 rounded flex items-center justify-center hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400 transition-colors cursor-pointer"
              >
                <Trophy className="h-3 w-3" />
              </div>
            )}
          </div>
        </button>

        {/* Expanded detail rows */}
        {expanded && (
          <div className="px-1.5 pb-1.5 space-y-px">
            {group.agent && (
              <StepRow
                type="agent"
                status={group.agent.status}
                selected={selectedId === group.agent.id}
                model={group.agent.model}
                promptTokens={group.agent.token_usage?.prompt_tokens}
                completionTokens={group.agent.token_usage?.completion_tokens}
                onClick={() => onSelect(group.agent!.id, "agent")}
              />
            )}
            {group.training && (
              <StepRow
                type="training"
                status={group.training.status}
                selected={selectedId === group.training.id}
                valBpb={group.training.val_bpb}
                improved={group.training.improved}
                commitSha={group.training.commit_sha}
                createdAt={group.training.created_at}
                onClick={() => onSelect(group.training!.id, "training")}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Step row (compact, inside expanded section) ───────── */

function StepRow({
  type,
  status,
  selected,
  model,
  promptTokens,
  completionTokens,
  valBpb,
  improved,
  commitSha,
  createdAt,
  onClick,
}: {
  type: "agent" | "training";
  status: string;
  selected: boolean;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  valBpb?: number | null;
  improved?: boolean | null;
  commitSha?: string | null;
  createdAt?: string;
  onClick: () => void;
}) {
  const isAgent = type === "agent";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md px-2.5 py-1.5 transition-all duration-150 flex items-center gap-2 ${
        selected
          ? "bg-primary/8 ring-1 ring-primary/20"
          : "hover:bg-accent"
      }`}
    >
      <div className={`h-4.5 w-4.5 rounded flex items-center justify-center shrink-0 ${
        isAgent ? "bg-cyan-500/10" : "bg-violet-500/10"
      }`}>
        {isAgent
          ? <Bot className="h-2.5 w-2.5 text-cyan-400" />
          : <Cpu className="h-2.5 w-2.5 text-violet-400" />
        }
      </div>

      <span className="text-[10px] font-medium text-muted-foreground">
        {isAgent ? "Agent" : "Train"}
      </span>
      <StatusDot status={status} />

      {isAgent && model && (
        <span className="text-[10px] font-mono text-muted-foreground truncate">{model}</span>
      )}

      {isAgent && promptTokens != null && completionTokens != null && (
        <span className="text-[9px] font-mono text-muted-foreground shrink-0">
          {formatTokens(promptTokens)}↑ {formatTokens(completionTokens)}↓
        </span>
      )}

      <div className="flex-1" />

      {!isAgent && valBpb != null && (
        <span className={`text-[10px] font-mono ${improved ? "text-emerald-400/80" : "text-foreground/50"}`}>
          {valBpb.toFixed(4)}
        </span>
      )}

      {!isAgent && commitSha && (
        <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-0.5 shrink-0">
          <GitCommit className="h-2.5 w-2.5" />
          {commitSha.slice(0, 7)}
        </span>
      )}

      {createdAt && (
        <span className="text-[9px] text-muted-foreground">{formatDistanceToNow(createdAt)}</span>
      )}
    </button>
  );
}

/* ── Status helpers ────────────────────────────────────── */

function StatusIndicator({ status }: { status: IterationGroup["status"] }) {
  const cls =
    status === "running" ? "bg-cyan-400 animate-pulse-dot" :
    status === "failed" ? "bg-red-400" :
    status === "completed" ? "bg-emerald-400" :
    "bg-zinc-500";
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${cls}`} />;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed" ? "bg-emerald-400" :
    status === "running" ? "bg-cyan-400 animate-pulse-dot" :
    status === "failed" ? "bg-red-400" :
    "bg-zinc-500";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
