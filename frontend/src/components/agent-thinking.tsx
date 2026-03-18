import { useMemo, useRef, useEffect } from "react";
import { Brain, Code, Lightbulb } from "lucide-react";

/**
 * Parses a streaming agent response into thinking (rationale) and code sections.
 * The agent outputs rationale text followed by a ```python code block.
 * Some models wrap reasoning in <think>...</think> tags — we extract that separately.
 */
function parseAgentStream(text: string): {
  phase: "thinking" | "coding" | "done";
  thinking: string;
  code: string;
  reasoning: string;
} {
  // Extract <think>...</think> blocks (some models like DeepSeek/Qwen use these)
  let reasoning = "";
  let cleaned = text;

  // Handle completed think blocks
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  while ((match = thinkRegex.exec(text)) !== null) {
    reasoning += match[1].trim() + "\n";
  }
  cleaned = cleaned.replace(thinkRegex, "").trim();

  // Handle still-open think block (streaming)
  const openThinkMatch = cleaned.match(/<think>([\s\S]*)$/);
  if (openThinkMatch) {
    reasoning += openThinkMatch[1].trim();
    cleaned = cleaned.slice(0, openThinkMatch.index).trim();
    // Still inside think block — no rationale or code yet
    return { phase: "thinking", thinking: "", code: "", reasoning: reasoning.trim() };
  }

  // Now parse the cleaned text for code blocks
  const codeBlockStart = cleaned.indexOf("```");

  if (codeBlockStart === -1) {
    return { phase: "thinking", thinking: cleaned, code: "", reasoning: reasoning.trim() };
  }

  const thinking = cleaned.slice(0, codeBlockStart).trim();

  const fenceEndIdx = cleaned.indexOf("\n", codeBlockStart);
  if (fenceEndIdx === -1) {
    return { phase: "coding", thinking, code: "", reasoning: reasoning.trim() };
  }

  const afterFence = cleaned.slice(fenceEndIdx + 1);

  const closingFence = afterFence.indexOf("```");
  if (closingFence === -1) {
    return { phase: "coding", thinking, code: afterFence, reasoning: reasoning.trim() };
  }

  return { phase: "done", thinking, code: afterFence.slice(0, closingFence), reasoning: reasoning.trim() };
}

export function AgentThinkingView({ stream, phase: phaseOverride }: { stream: string; phase?: "thinking" | "coding" }) {
  const parsed = useMemo(() => parseAgentStream(stream), [stream]);
  // Use the more advanced phase — the stream-parsed phase can detect code blocks
  // faster than the backend SSE phase, so pick whichever is further along.
  const parsedPhase = parsed.phase;
  const PHASE_ORDER = { thinking: 0, coding: 1, done: 2 } as const;
  const phase =
    parsedPhase === "done"
      ? "done"
      : (phaseOverride && PHASE_ORDER[phaseOverride] > PHASE_ORDER[parsedPhase])
        ? phaseOverride
        : parsedPhase;
  const { thinking, code, reasoning } = parsed;

  // When phase says "coding" but parser didn't find a code fence (reconnect or
  // race), treat the raw text as code rather than showing it in rationale.
  let displayThinking = thinking;
  let displayCode = code;
  if (phase === "coding" && !code && thinking) {
    displayThinking = "";
    displayCode = thinking;
  }

  const codeRef = useRef<HTMLPreElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);

  // Auto-scroll code view
  useEffect(() => {
    if (codeRef.current && (phase === "coding" || phase === "done")) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
  }, [code, thinking, phase]);

  // Auto-scroll reasoning view
  useEffect(() => {
    if (reasoningRef.current && phase === "thinking" && reasoning) {
      reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
    }
  }, [reasoning, phase]);

  return (
    <div className="overflow-hidden">
      {/* Internal reasoning section (from <think> tags) */}
      {reasoning && (
        <div className={`mx-5 mb-3 transition-all duration-300 ${phase !== "thinking" ? "max-h-64 overflow-hidden opacity-50" : ""}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="h-3 w-3 text-purple-400" />
            <span className="text-[10px] text-purple-400/70 uppercase tracking-wider font-medium">
              Internal Reasoning
            </span>
          </div>
          <div ref={reasoningRef} className="rounded-lg bg-purple-500/[4%] border border-purple-500/10 px-4 py-3 max-h-48 overflow-y-auto">
            <p className="text-xs text-foreground/50 leading-relaxed whitespace-pre-wrap">
              {reasoning}
              {phase === "thinking" && !thinking && (
                <span className="inline-block w-1.5 h-3.5 bg-purple-400/60 animate-pulse-dot ml-0.5 -mb-0.5" />
              )}
            </p>
          </div>
        </div>
      )}

      {/* Thinking/rationale section */}
      {displayThinking && (
        <div className={`mx-5 mb-3 transition-all duration-300 ${phase !== "thinking" ? "max-h-64 overflow-hidden opacity-50" : ""}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] text-amber-400/70 uppercase tracking-wider font-medium">
              Rationale
            </span>
          </div>
          <div className="rounded-lg bg-amber-500/[4%] border border-amber-500/10 px-4 py-3 max-h-96 overflow-y-auto">
            <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">
              {displayThinking}
              {phase === "thinking" && (
                <span className="inline-block w-1.5 h-3.5 bg-amber-400/60 animate-pulse-dot ml-0.5 -mb-0.5" />
              )}
            </p>
          </div>
        </div>
      )}

      {/* Code section */}
      {(phase === "coding" || phase === "done") && (
        <div className="mx-5 mb-5">
          <div className="flex items-center gap-1.5 mb-2">
            <Code className="h-3 w-3 text-cyan-400" />
            <span className="text-[10px] text-cyan-400/70 uppercase tracking-wider font-medium">
              Patch Code
            </span>
            {displayCode && (
              <span className="text-[10px] text-muted-foreground/40 font-mono ml-auto">
                {displayCode.split("\n").length} lines
              </span>
            )}
          </div>
          <pre
            ref={codeRef}
            className="rounded-lg bg-black/40 px-4 py-3 font-mono text-xs leading-6 text-zinc-200 whitespace-pre-wrap max-h-[400px] overflow-auto border border-cyan-500/15"
          >
            {displayCode}
            {phase === "coding" && (
              <span className="inline-block w-1.5 h-4 bg-cyan-400/70 animate-pulse-dot ml-0.5 -mb-0.5" />
            )}
          </pre>
        </div>
      )}

      {/* Empty state — waiting for stream */}
      {!stream && (
        <div className="px-5 pb-5">
          <div className="rounded-lg bg-black/20 border border-border/15 p-6 flex items-center justify-center">
            <div className="flex items-center gap-2 text-zinc-400">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan-400/50 animate-pulse-dot" />
              <span className="text-xs font-mono">Waiting for agent response...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PhaseIndicator({ phase }: { phase: "thinking" | "coding" | "done" }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1">
        <div
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            phase === "thinking"
              ? "bg-amber-400 animate-pulse-dot"
              : "bg-amber-400/30"
          }`}
        />
        <span
          className={`text-[9px] font-mono uppercase ${
            phase === "thinking"
              ? "text-amber-400"
              : "text-muted-foreground/30"
          }`}
        >
          Think
        </span>
      </div>
      <div className="w-3 h-px bg-border/30" />
      <div className="flex items-center gap-1">
        <div
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            phase === "coding"
              ? "bg-cyan-400 animate-pulse-dot"
              : phase === "done"
              ? "bg-cyan-400/30"
              : "bg-muted-foreground/20"
          }`}
        />
        <span
          className={`text-[9px] font-mono uppercase ${
            phase === "coding"
              ? "text-cyan-400"
              : phase === "done"
              ? "text-muted-foreground/30"
              : "text-muted-foreground/20"
          }`}
        >
          Code
        </span>
      </div>
      {phase === "done" && (
        <>
          <div className="w-3 h-px bg-border/30" />
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </>
      )}
    </div>
  );
}
