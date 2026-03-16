import { useEffect } from "react";
import type { RunAction, RunState } from "@/lib/types";

const ACTION_BY_KEY: Record<string, { action: RunAction; validStates: RunState[] }> = {
  a: { action: "approve_patch", validStates: ["awaiting_patch_review"] },
  r: { action: "reject_patch", validStates: ["awaiting_patch_review"] },
  w: { action: "continue", validStates: ["awaiting_next_action"] },
  p: { action: "pause", validStates: ["awaiting_agent", "awaiting_patch_review", "awaiting_next_action"] },
};

export function useKeyboardShortcuts(
  state: RunState | undefined,
  onAction: (action: RunAction) => void,
) {
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const mapping = ACTION_BY_KEY[e.key.toLowerCase()];
      if (mapping && mapping.validStates.includes(state)) {
        e.preventDefault();
        onAction(mapping.action);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, onAction]);
}
