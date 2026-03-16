import type { RunState } from "@/lib/types";

const STATE_CONFIG: Record<RunState, { label: string; dot: string; bg: string; text: string; border: string }> = {
  idle:                  { label: "Idle",            dot: "bg-zinc-400",       bg: "bg-zinc-500/8",    text: "text-zinc-400",   border: "border-zinc-500/20" },
  preparing:             { label: "Preparing",       dot: "bg-cyan-400 animate-pulse-dot",  bg: "bg-cyan-500/8",    text: "text-cyan-300",   border: "border-cyan-500/20" },
  awaiting_agent:        { label: "Awaiting Agent",  dot: "bg-cyan-400",       bg: "bg-cyan-500/8",    text: "text-cyan-300",   border: "border-cyan-500/20" },
  agent_running:         { label: "Agent Running",   dot: "bg-cyan-400 animate-pulse-dot",  bg: "bg-cyan-500/10",   text: "text-cyan-300",   border: "border-cyan-500/25" },
  awaiting_patch_review: { label: "Patch Review",    dot: "bg-amber-400 animate-pulse-dot", bg: "bg-amber-500/10",  text: "text-amber-300",  border: "border-amber-500/25" },
  patch_approved:        { label: "Approved",        dot: "bg-emerald-400",    bg: "bg-emerald-500/8", text: "text-emerald-300", border: "border-emerald-500/20" },
  training_running:      { label: "Training",        dot: "bg-violet-400 animate-pulse-dot", bg: "bg-violet-500/10", text: "text-violet-300", border: "border-violet-500/25" },
  training_finished:     { label: "Training Done",   dot: "bg-emerald-400",    bg: "bg-emerald-500/8", text: "text-emerald-300", border: "border-emerald-500/20" },
  awaiting_next_action:  { label: "Ready",           dot: "bg-amber-400",      bg: "bg-amber-500/8",   text: "text-amber-300",  border: "border-amber-500/20" },
  done:                  { label: "Done",            dot: "bg-emerald-400",    bg: "bg-emerald-500/10", text: "text-emerald-300", border: "border-emerald-500/25" },
  paused:                { label: "Paused",          dot: "bg-zinc-400",       bg: "bg-zinc-500/8",    text: "text-zinc-400",   border: "border-zinc-500/20" },
  failed:                { label: "Failed",          dot: "bg-red-400",        bg: "bg-red-500/10",    text: "text-red-300",    border: "border-red-500/25" },
  canceled:              { label: "Canceled",        dot: "bg-zinc-500",       bg: "bg-zinc-500/6",    text: "text-zinc-500",   border: "border-zinc-500/15" },
};

export function StatusBadge({ state }: { state: RunState }) {
  const cfg = STATE_CONFIG[state] ?? STATE_CONFIG.idle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
