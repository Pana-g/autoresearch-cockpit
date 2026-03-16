import { useEffect, useState, useMemo } from "react";
import { useUIStore } from "@/stores/ui-store";
import { Clock, Hash, Target, Activity, Flame } from "lucide-react";

function useElapsedTime(startedAt: number | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

/** Parse step progress from training log lines. Looks for patterns like "step 100/5000" */
function parseProgress(lines: string[]): { current: number; total: number } | null {
  // Scan from the end for the most recent progress line
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
    const match = lines[i].match(/step\s+(\d+)\s*[/|]\s*(\d+)/i);
    if (match) {
      return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
    }
  }
  return null;
}

interface TrainingInfoCardProps {
  iteration: number;
  bestValBpb: number | null;
  model: string;
}

export function TrainingInfoCard({ iteration, bestValBpb, model }: TrainingInfoCardProps) {
  const { trainingLog, trainingStartedAt } = useUIStore();
  const elapsed = useElapsedTime(trainingStartedAt);

  const progress = useMemo(() => parseProgress(trainingLog), [trainingLog]);

  const progressPct = progress && progress.total > 0
    ? Math.min(100, (progress.current / progress.total) * 100)
    : null;

  return (
    <div className="glass rounded-xl overflow-hidden glow-violet mb-4">
      {/* Top bar with pulse */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/15">
        <div className="relative">
          <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Flame className="h-4 w-4 text-violet-400" />
          </div>
          <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-violet-400 animate-pulse-dot" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/90">Training in Progress</p>
          <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{model}</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20">
          <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse-dot" />
          <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">Running</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-px bg-border/10">
        <StatCell
          icon={<Clock className="h-3.5 w-3.5 text-amber-400" />}
          label="Elapsed"
          value={formatDuration(elapsed)}
          mono
        />
        <StatCell
          icon={<Hash className="h-3.5 w-3.5 text-violet-400" />}
          label="Iteration"
          value={String(iteration)}
        />
        <StatCell
          icon={<Target className="h-3.5 w-3.5 text-emerald-400" />}
          label="Best val_bpb"
          value={bestValBpb?.toFixed(4) ?? "—"}
          highlight={bestValBpb != null}
        />
      </div>

      {/* Progress bar */}
      {progressPct != null && (
        <div className="px-5 py-3 border-t border-border/10">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Activity className="h-3 w-3 text-violet-400" />
              <span>Step {progress!.current.toLocaleString()} / {progress!.total.toLocaleString()}</span>
            </div>
            <span className="text-[11px] font-mono font-medium text-violet-400">
              {progressPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-tint/[5%] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({
  icon, label, value, mono, highlight, dim,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="px-4 py-3 bg-tint/[1%]">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-sm font-medium tabular-nums ${mono ? "font-mono" : ""} ${highlight ? "text-emerald-400" : dim ? "text-muted-foreground/40" : "text-foreground/90"}`}>
        {value}
      </p>
    </div>
  );
}
