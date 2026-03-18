import { useUsageSummary, useUsage } from "@/hooks/use-queries";
import { Coins, ArrowUp, ArrowDown, Layers } from "lucide-react";

export function UsagePanel({ runId }: { runId?: string }) {
  const { data: summary } = useUsageSummary(runId);
  const { data: usageList } = useUsage(runId);

  if (!summary) return null;

  // Group usage by provider/model
  const grouped = new Map<string, { prompt: number; completion: number; cost: number; count: number }>();
  usageList?.forEach((u) => {
    const key = `${u.provider}/${u.model}`;
    const existing = grouped.get(key) ?? { prompt: 0, completion: 0, cost: 0, count: 0 };
    existing.prompt += u.prompt_tokens;
    existing.completion += u.completion_tokens;
    existing.cost += u.estimated_cost;
    existing.count += 1;
    grouped.set(key, existing);
  });

  return (
    <div className="glass rounded-xl p-5 text-left">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-6 w-6 rounded-md bg-amber-500/10 flex items-center justify-center">
          <Coins className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Token Usage</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatBox icon={<ArrowUp className="h-3 w-3" />} label="Prompt" value={formatNum(summary.total_prompt_tokens)} />
        <StatBox icon={<ArrowDown className="h-3 w-3" />} label="Completion" value={formatNum(summary.total_completion_tokens)} />
        <StatBox icon={<Coins className="h-3 w-3 text-amber-400" />} label="Cost" value={`$${summary.total_estimated_cost.toFixed(4)}`} highlight />
        <StatBox icon={<Layers className="h-3 w-3" />} label="Steps" value={String(summary.step_count)} />
      </div>

      {grouped.size > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">By Model</p>
          {[...grouped.entries()].map(([key, v]) => (
            <div key={key} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-muted/50 border border-border">
              <span className="font-mono truncate text-muted-foreground">{key}</span>
              <span className="text-muted-foreground font-mono">
                {v.cost > 0 ? `$${v.cost.toFixed(4)}` : "Seat"} · {v.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-sm font-mono font-semibold ${highlight ? "text-amber-400" : ""}`}>{value}</p>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
