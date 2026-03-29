export function TokenDisplay({ prompt, completion, cost, source }: {
  prompt: number;
  completion: number;
  cost: number;
  source?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
      <span title="Prompt tokens" className="flex items-center gap-0.5">
        <span className="text-cyan-400/60">↑</span>{formatNumber(prompt)}
      </span>
      <span title="Completion tokens" className="flex items-center gap-0.5">
        <span className="text-violet-400/60">↓</span>{formatNumber(completion)}
      </span>
      {cost > 0 ? (
        <span className="text-amber-400/80" title="Estimated cost">${cost.toFixed(4)}</span>
      ) : (
        <span className="text-muted-foreground" title="Seat-based">Seat</span>
      )}
      {source && (
        <span className={source === "provider_reported" ? "text-emerald-400/60" : "text-muted-foreground"}>
          {source === "provider_reported" ? "●" : "○"}
        </span>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
