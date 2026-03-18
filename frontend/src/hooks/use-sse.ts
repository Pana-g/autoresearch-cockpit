import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSSEUrl } from "@/lib/api";
import { useUIStore } from "@/stores/ui-store";
import { toast } from "sonner";
import type { SSEMessage } from "@/lib/types";

export function useRunSSE(projectId: string, runId: string) {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);

  useEffect(() => {
    if (!runId) return;

    // Access store actions via getState() to keep a stable dependency array
    // and avoid SSE reconnection storms on every re-render.
    const ui = () => useUIStore.getState();

    function connect() {
      const url = getSSEUrl(runId);
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        retryDelay.current = 1000;
      };

      es.onmessage = (ev) => {
        let msg: SSEMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }

        switch (msg.event) {
          case "state_change":
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            break;
          case "agent_streaming_start":
            ui().clearAgentStream();
            ui().setAgentPhase((msg.data?.phase as "thinking" | "coding") ?? "thinking");
            break;
          case "agent_chunk":
            ui().appendAgentStream(String(msg.data?.text ?? ""));
            break;
          case "agent_phase_change":
            ui().setAgentPhase((msg.data?.phase as "thinking" | "coding") ?? "coding");
            break;
          case "agent_streaming_end":
            ui().setAgentPhase("idle");
            qc.invalidateQueries({ queryKey: ["agent-steps", runId] });
            break;
          case "agent_snapshot":
            ui().setAgentPhase((msg.data?.phase as "thinking" | "coding") ?? "thinking");
            if (typeof msg.data?.text === "string" && msg.data.text) {
                ui().clearAgentStream();
                ui().appendAgentStream(msg.data.text);
            }
            break;
          case "patch_ready":
            qc.invalidateQueries({ queryKey: ["agent-steps", runId] });
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            break;
          case "patch_applied":
            qc.invalidateQueries({ queryKey: ["git-log", runId] });
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            break;
          case "patch_rejected":
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            break;
          case "training_started":
            ui().setTrainingStarted(msg.data?.started_at as string | undefined);
            break;
          case "training_stdout":
            ui().appendTrainingLog(String(msg.data?.line ?? ""));
            break;
          case "training_stderr":
            ui().appendTrainingLog(`[stderr] ${msg.data?.line ?? ""}`);
            break;
          case "training_completed":
            ui().clearTrainingLog();
            ui().clearTrainingStarted();
            qc.invalidateQueries({ queryKey: ["training-steps", runId] });
            qc.invalidateQueries({ queryKey: ["chart-data", runId] });
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            qc.invalidateQueries({ queryKey: ["usage", runId] });
            qc.invalidateQueries({ queryKey: ["usage-summary", runId] });
            break;
          case "training_failed":
          case "training_timeout":
            ui().clearTrainingLog();
            ui().clearTrainingStarted();
            qc.invalidateQueries({ queryKey: ["training-steps", runId] });
            qc.invalidateQueries({ queryKey: ["chart-data", runId] });
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            break;
          case "agent_timeout":
            ui().clearAgentStream();
            ui().setAgentPhase("idle");
            qc.invalidateQueries({ queryKey: ["agent-steps", runId] });
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            break;
          case "auto_approve":
          case "auto_continue":
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            break;
          case "run_done":
          case "run_paused":
          case "run_canceled":
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            break;
          case "error":
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            if (msg.data?.message) {
              toast.error("Run error", {
                description: String(msg.data.message).slice(0, 200),
                duration: 10000,
              });
            }
            break;
          case "compaction_needed": {
            const pTokens = msg.data?.prompt_tokens as number;
            const cLimit = msg.data?.context_limit as number;
            const pct = Math.round((pTokens / cLimit) * 100);
            toast.warning("Context window threshold reached", {
              description: `Prompt is at ${pct}% of context limit (${Math.round(pTokens / 1000)}k / ${Math.round(cLimit / 1000)}k tokens)`,
              duration: 8000,
            });
            break;
          }
          case "compaction_done":
            qc.invalidateQueries({ queryKey: ["runs", projectId, runId] });
            qc.invalidateQueries({ queryKey: ["compaction", runId] });
            toast.success("Context compacted", {
              description: `Memory compacted up to iteration ${msg.data?.compacted_up_to}`,
              duration: 5000,
            });
            break;
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        retryTimer.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 1.5, 10000);
          connect();
        }, retryDelay.current);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [runId, projectId, qc]);
}
