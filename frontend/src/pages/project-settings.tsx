import { useParams, Link } from "react-router-dom";
import { useProject, useUpdateProjectSettings, useSetProjectBest, useProjectTrainingSteps } from "@/hooks/use-queries";
import { Switch } from "@/components/ui/switch";
import { NumberInput } from "@/components/number-input";
import { Button } from "@/components/ui/button";
import { Settings, ArrowLeft, ShieldCheck, FastForward, Timer, TrendingDown, Trophy, Loader2, Layers, Gauge } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project } = useProject(projectId!);
  const updateSettings = useUpdateProjectSettings(projectId!);
  const setProjectBest = useSetProjectBest(projectId!);
  const { data: trainingSteps, isLoading: stepsLoading } = useProjectTrainingSteps(projectId!);

  if (!project) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const handleToggle = (field: string, value: boolean) => {
    updateSettings.mutate({ [field]: value }, {
      onSuccess: () => toast.success("Setting updated"),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleNumber = (field: string, value: number | null) => {
    updateSettings.mutate({ [field]: value }, {
      onSuccess: () => toast.success("Setting updated"),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleSetBest = (stepId: string) => {
    setProjectBest.mutate(stepId, {
      onSuccess: (p) => toast.success(`Project best updated to ${p.best_val_bpb?.toFixed(4)}`),
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to project
        </Link>
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 glow-teal">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Project settings &amp; run defaults</p>
          </div>
        </div>
      </motion.div>

      <div className="sep-gradient" />

      {/* Run Defaults */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="space-y-5"
      >
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Run Defaults</h2>
        <p className="text-[11px] text-muted-foreground/60">These settings are applied when creating new runs for this project.</p>

        <div className="space-y-3">
          {/* Auto Approve */}
          <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Auto Approve Patches</p>
                <p className="text-[11px] text-muted-foreground/60">Automatically approve agent-generated patches without review</p>
              </div>
            </div>
            <Switch
              checked={project.default_auto_approve}
              onCheckedChange={(v) => handleToggle("default_auto_approve", v)}
            />
          </div>

          {/* Auto Continue */}
          <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <FastForward className="h-4 w-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Auto Continue</p>
                <p className="text-[11px] text-muted-foreground/60">Automatically start next iteration after training completes</p>
              </div>
            </div>
            <Switch
              checked={project.default_auto_continue}
              onCheckedChange={(v) => handleToggle("default_auto_continue", v)}
            />
          </div>

          {/* Max Iterations */}
          <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Timer className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Max Iterations</p>
                <p className="text-[11px] text-muted-foreground/60">Maximum iterations per run (0 = unlimited)</p>
              </div>
            </div>
            <NumberInput
              integer
              className="h-9 w-24 text-sm bg-tint/[3%] border-border/50 focus:border-primary/40 transition-colors font-mono text-right"
              value={project.default_max_iterations || ""}
              placeholder="∞"
              onCommit={(val) => handleNumber("default_max_iterations", val ?? 0)}
            />
          </div>

          {/* Overfit Floor */}
          <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Overfit Floor</p>
                <p className="text-[11px] text-muted-foreground/60">val_bpb below this is treated as overfitting (empty = disabled)</p>
              </div>
            </div>
            <NumberInput
              className="h-9 w-28 text-sm bg-tint/[3%] border-border/50 focus:border-primary/40 transition-colors font-mono text-right"
              value={project.default_overfit_floor}
              placeholder="None"
              onCommit={(val) => handleNumber("default_overfit_floor", val)}
            />
          </div>

          {/* Overfit Margin */}
          <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Overfit Margin</p>
                <p className="text-[11px] text-muted-foreground/60">Stop when val_bpb is within this distance above floor (empty = disabled)</p>
              </div>
            </div>
            <NumberInput
              className="h-9 w-28 text-sm bg-tint/[3%] border-border/50 focus:border-primary/40 transition-colors font-mono text-right"
              value={project.default_overfit_margin}
              placeholder="None"
              onCommit={(val) => handleNumber("default_overfit_margin", val)}
            />
          </div>
        </div>
      </motion.section>

      <div className="sep-gradient" />

      {/* Context Compaction Defaults */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08 }}
        className="space-y-5"
      >
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Context Compaction</h2>
        <p className="text-[11px] text-muted-foreground/60">Default context compaction settings for new runs. Compaction reduces prompt size by summarizing older iteration memories.</p>

        <div className="space-y-3">
          {/* Auto Compact */}
          <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Layers className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Auto Compact</p>
                <p className="text-[11px] text-muted-foreground/60">Automatically compact memory when context threshold is reached</p>
              </div>
            </div>
            <Switch
              checked={project.default_auto_compact}
              onCheckedChange={(v) => handleToggle("default_auto_compact", v)}
            />
          </div>

          {/* Compact Threshold */}
          <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Gauge className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Threshold %</p>
                <p className="text-[11px] text-muted-foreground/60">Compact when prompt reaches this % of the model's context window</p>
              </div>
            </div>
            <NumberInput
              integer
              min={10}
              max={95}
              className="h-9 w-24 text-sm bg-tint/[3%] border-border/50 focus:border-primary/40 transition-colors font-mono text-right"
              value={project.default_compact_threshold_pct || ""}
              placeholder="50"
              onCommit={(val) => handleNumber("default_compact_threshold_pct", val ?? 50)}
            />
          </div>

          {/* Context Limit */}
          <div className="glass rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Timer className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Context Limit</p>
                <p className="text-[11px] text-muted-foreground/60">Override model's context window size in tokens (0 = auto-detect from model)</p>
              </div>
            </div>
            <NumberInput
              integer
              min={0}
              className="h-9 w-28 text-sm bg-tint/[3%] border-border/50 focus:border-primary/40 transition-colors font-mono text-right"
              value={project.default_context_limit || ""}
              placeholder="auto"
              onCommit={(val) => handleNumber("default_context_limit", val ?? 0)}
            />
          </div>
        </div>
      </motion.section>

      <div className="sep-gradient" />

      {/* Best Iteration Selection */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="space-y-5"
      >
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project Best</h2>
        <p className="text-[11px] text-muted-foreground/60">
          Select which training iteration serves as the project-level best. New runs inherit the train.py code from this iteration.
        </p>

        {/* Current best display */}
        {project.best_val_bpb != null ? (
          <div className="glass rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Trophy className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  Current best: <span className="font-mono text-emerald-400">{project.best_val_bpb.toFixed(4)}</span>
                </p>
                {project.best_run_id && project.best_iteration != null && (
                  <Link
                    to={`/projects/${projectId}/runs/${project.best_run_id}`}
                    className="text-[11px] font-mono text-muted-foreground/50 hover:text-primary/70 transition-colors"
                  >
                    run {project.best_run_id.slice(0, 8)} · iter #{project.best_iteration}
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass rounded-xl px-5 py-4">
            <p className="text-sm text-muted-foreground/50 italic">No best iteration set yet. Complete a training run to see results here.</p>
          </div>
        )}

        {/* Training steps list to select from */}
        {stepsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 text-muted-foreground/40 animate-spin" />
          </div>
        ) : trainingSteps && trainingSteps.length > 0 ? (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {trainingSteps.map((step) => {
              const isCurrent = project.best_run_id === step.run_id && project.best_iteration === step.iteration;
              return (
                <div
                  key={step.id}
                  className={`glass rounded-lg px-4 py-3 flex items-center gap-3 transition-all duration-150 ${
                    isCurrent
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "hover:border-primary/20"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-emerald-400/80">
                        {step.val_bpb?.toFixed(4)}
                      </span>
                      {step.improved && (
                        <span className="text-[9px] font-mono text-emerald-500/60">▲</span>
                      )}
                      {isCurrent && (
                        <span className="text-[9px] uppercase tracking-wider font-medium text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                          current
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground/50 font-mono mt-0.5">
                      run {step.run_id.slice(0, 8)} · iter #{step.iteration}
                      {step.commit_sha && <> · {step.commit_sha.slice(0, 7)}</>}
                    </p>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                      onClick={() => handleSetBest(step.id)}
                      disabled={setProjectBest.isPending}
                    >
                      <Trophy className="h-3 w-3 mr-1" />
                      Set as best
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/40 italic">No completed training iterations found.</p>
        )}
      </motion.section>
    </div>
  );
}
