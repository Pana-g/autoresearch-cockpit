import { useState, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useThemeStore, getEffectiveTheme } from "@/stores/theme-store";
import { runs } from "@/lib/api";
import type { AgentStep, TrainingStep } from "@/lib/types";
import { GitCompareArrows, ChevronDown, TrendingUp, TrendingDown, Minus, X, Loader2 } from "lucide-react";

const ReactDiffViewer = lazy(() => import("react-diff-viewer-continued"));

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  runId: string;
}

export function DiffCompareModal({ open, onClose, projectId, runId }: Props) {
  const isDark = useThemeStore((s) => getEffectiveTheme(s.theme) === "dark");

  // Fetch ALL agent steps and training steps when the modal is open
  const { data: agentSteps = [], isLoading: loadingAgent } = useQuery({
    queryKey: ["compare-agent-steps", runId],
    queryFn: () => runs.agentSteps(projectId, runId, 10000, 0),
    enabled: open && !!runId,
    staleTime: 30_000,
  });
  const { data: trainingSteps = [], isLoading: loadingTraining } = useQuery({
    queryKey: ["compare-training-steps", runId],
    queryFn: () => runs.trainingSteps(projectId, runId, 10000, 0),
    enabled: open && !!runId,
    staleTime: 30_000,
  });

  const loading = loadingAgent || loadingTraining;

  // Steps that have patches, sorted by iteration asc
  const stepsWithPatches = useMemo(
    () =>
      agentSteps
        .filter((s) => s.patch)
        .sort((a, b) => a.iteration - b.iteration),
    [agentSteps],
  );

  const [leftIteration, setLeftIteration] = useState<number | null>(null);
  const [rightIteration, setRightIteration] = useState<number | null>(null);

  // Auto-select the two most recent iterations on first open
  if (open && leftIteration === null && rightIteration === null && stepsWithPatches.length >= 2) {
    setLeftIteration(stepsWithPatches[stepsWithPatches.length - 2].iteration);
    setRightIteration(stepsWithPatches[stepsWithPatches.length - 1].iteration);
  }

  const leftStep = stepsWithPatches.find((s) => s.iteration === leftIteration);
  const rightStep = stepsWithPatches.find((s) => s.iteration === rightIteration);

  const handleClose = () => {
    onClose();
    setLeftIteration(null);
    setRightIteration(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="glass border-border max-w-[95vw] sm:max-w-[95vw] w-full max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <GitCompareArrows className="h-4 w-4 text-cyan-400" />
            Compare Iteration Patches
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading all iterations…
          </div>
        ) : stepsWithPatches.length < 2 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Need at least 2 iterations with patches to compare.
          </div>
        ) : (
          <>
            {/* Iteration Selectors */}
            <div className="flex items-center gap-4 px-1">
              <IterationSelect
                label="From"
                value={leftIteration}
                steps={stepsWithPatches}
                trainingSteps={trainingSteps}
                onChange={setLeftIteration}
                excludeIteration={rightIteration}
              />
              <div className="flex items-center justify-center px-2">
                <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
              </div>
              <IterationSelect
                label="To"
                value={rightIteration}
                steps={stepsWithPatches}
                trainingSteps={trainingSteps}
                onChange={setRightIteration}
                excludeIteration={leftIteration}
              />
            </div>

            {/* Rationale comparison */}
            {(leftStep?.rationale || rightStep?.rationale) && (
              <div className="grid grid-cols-2 gap-3 px-1">
                {leftStep?.rationale && (
                  <div className="rounded-lg bg-muted/50 border border-border p-3">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                      Rationale — #{leftIteration}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4 whitespace-pre-wrap">
                      {leftStep.rationale}
                    </p>
                  </div>
                )}
                {rightStep?.rationale && (
                  <div className="rounded-lg bg-muted/50 border border-border p-3">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                      Rationale — #{rightIteration}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4 whitespace-pre-wrap">
                      {rightStep.rationale}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Diff Viewer */}
            <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
              {leftStep?.patch && rightStep?.patch ? (
                <Suspense
                  fallback={
                    <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
                      Loading diff viewer...
                    </div>
                  }
                >
                  <ReactDiffViewer
                    oldValue={leftStep.patch}
                    newValue={rightStep.patch}
                    splitView
                    leftTitle={`Iteration #${leftIteration} — ${leftStep.provider}/${leftStep.model}`}
                    rightTitle={`Iteration #${rightIteration} — ${rightStep.provider}/${rightStep.model}`}
                    useDarkTheme={isDark}
                    styles={{
                      contentText: { fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" },
                    }}
                  />
                </Suspense>
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  Select two iterations to compare their patches
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Iteration dropdown selector ───────────────────────── */

function getOutcome(step: AgentStep, trainingSteps: TrainingStep[]) {
  const training = trainingSteps.find((t) => t.iteration === step.iteration);
  if (!training) {
    if (step.status === "failed") return { label: "Failed", color: "text-red-400", Icon: X };
    if (step.status === "running") return { label: "Running", color: "text-cyan-400", Icon: Minus };
    return { label: "No training", color: "text-muted-foreground", Icon: Minus };
  }
  if (training.status === "failed") return { label: "Train failed", color: "text-red-400", Icon: X };
  if (training.improved === true) return { label: `Improved${training.val_bpb != null ? ` (${training.val_bpb.toFixed(4)})` : ""}`, color: "text-emerald-400", Icon: TrendingUp };
  if (training.improved === false) return { label: `No gain${training.val_bpb != null ? ` (${training.val_bpb.toFixed(4)})` : ""}`, color: "text-amber-400", Icon: TrendingDown };
  if (training.val_bpb != null) return { label: training.val_bpb.toFixed(4), color: "text-muted-foreground", Icon: Minus };
  return { label: "Pending", color: "text-muted-foreground", Icon: Minus };
}

function IterationSelect({
  label,
  value,
  steps,
  trainingSteps,
  onChange,
  excludeIteration,
}: {
  label: string;
  value: number | null;
  steps: AgentStep[];
  trainingSteps: TrainingStep[];
  onChange: (iteration: number) => void;
  excludeIteration: number | null;
}) {
  const [open, setOpen] = useState(false);

  const selected = steps.find((s) => s.iteration === value);
  const selectedOutcome = selected ? getOutcome(selected, trainingSteps) : null;

  return (
    <div className="flex-1 relative">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{label}</p>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 h-8 px-3 rounded-lg text-xs font-mono
          bg-muted/50 border border-border hover:border-primary/30 transition-colors"
      >
        <span className="truncate flex items-center gap-1.5">
          {selected ? (
            <>
              #{selected.iteration} — {selected.provider}/{selected.model}
              <span className={`${selectedOutcome!.color} text-[10px]`}>· {selectedOutcome!.label}</span>
            </>
          ) : "Select iteration"}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-xl max-h-48 overflow-y-auto">
            {steps.map((step) => {
              const disabled = step.iteration === excludeIteration;
              const outcome = getOutcome(step, trainingSteps);
              return (
                <button
                  key={step.id}
                  disabled={disabled}
                  onClick={() => {
                    onChange(step.iteration);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] font-mono transition-colors flex items-center gap-2 ${
                    disabled
                      ? "text-muted-foreground cursor-not-allowed"
                      : step.iteration === value
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent text-foreground"
                  }`}
                >
                  <span className="flex-1 truncate">#{step.iteration} — {step.provider}/{step.model}</span>
                  <span className={`${outcome.color} flex items-center gap-1 shrink-0 text-[10px]`}>
                    <outcome.Icon className="h-3 w-3" />
                    {outcome.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
