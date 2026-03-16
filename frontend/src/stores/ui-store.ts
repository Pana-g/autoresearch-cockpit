import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  /** streaming agent text */
  agentStream: string;
  /** current agent phase as reported by the backend */
  agentPhase: "idle" | "thinking" | "coding";
  appendAgentStream: (chunk: string) => void;
  clearAgentStream: () => void;
  setAgentPhase: (phase: "idle" | "thinking" | "coding") => void;

  /** live training log lines */
  trainingLog: string[];
  appendTrainingLog: (line: string) => void;
  clearTrainingLog: () => void;

  /** training timing */
  trainingStartedAt: number | null;
  setTrainingStarted: (isoTimestamp?: string) => void;
  clearTrainingStarted: () => void;
}

// ── Batching buffers (outside React) ──────────────────────
let _agentBuffer = "";
let _agentRaf: number | null = null;
let _trainingBuffer: string[] = [];
let _trainingRaf: number | null = null;

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  agentStream: "",
  agentPhase: "idle" as const,
  setAgentPhase: (phase) => set({ agentPhase: phase }),
  appendAgentStream: (chunk) => {
    _agentBuffer += chunk;
    if (_agentRaf === null) {
      _agentRaf = requestAnimationFrame(() => {
        const buffered = _agentBuffer;
        _agentBuffer = "";
        _agentRaf = null;
        set((s) => ({ agentStream: s.agentStream + buffered }));
      });
    }
  },
  clearAgentStream: () => {
    _agentBuffer = "";
    if (_agentRaf !== null) { cancelAnimationFrame(_agentRaf); _agentRaf = null; }
    set({ agentStream: "", agentPhase: "idle" });
  },

  trainingLog: [],
  appendTrainingLog: (line) => {
    _trainingBuffer.push(line);
    if (_trainingRaf === null) {
      _trainingRaf = requestAnimationFrame(() => {
        const lines = _trainingBuffer;
        _trainingBuffer = [];
        _trainingRaf = null;
        set((s) => ({ trainingLog: [...s.trainingLog, ...lines] }));
      });
    }
  },
  clearTrainingLog: () => {
    _trainingBuffer = [];
    if (_trainingRaf !== null) { cancelAnimationFrame(_trainingRaf); _trainingRaf = null; }
    set({ trainingLog: [] });
  },

  trainingStartedAt: null,
  setTrainingStarted: (isoTimestamp?: string) => set({ trainingStartedAt: isoTimestamp ? new Date(isoTimestamp).getTime() : Date.now() }),
  clearTrainingStarted: () => set({ trainingStartedAt: null }),
}));
