import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { TokenDisplay } from "@/components/token-display";
import { Check, X, Pencil, GitCommit } from "lucide-react";
import { useThemeStore } from "@/stores/theme-store";
import type { AgentStep } from "@/lib/types";

const ReactDiffViewer = lazy(() => import("react-diff-viewer-continued"));
const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface Props {
  step: AgentStep;
  originalCode?: string;
  onApprove: () => void;
  onReject: () => void;
  onEdit?: (newCode: string) => void;
  tokenUsage?: { prompt_tokens: number; completion_tokens: number; estimated_cost: number; usage_source: string };
}

export function PatchReview({ step, originalCode, onApprove, onReject, onEdit, tokenUsage }: Props) {
  const [editing, setEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(step.patch ?? "");
  const isDark = useThemeStore((s) => s.theme === "dark" || (s.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches));

  const patchedCode = step.patch ?? "";

  return (
    <div className="glass rounded-xl overflow-hidden glow-amber">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <GitCommit className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Patch Review — Iteration {step.iteration}</p>
              <p className="text-[11px] text-muted-foreground/60 font-mono">{step.provider}/{step.model}</p>
            </div>
          </div>
          {tokenUsage && (
            <TokenDisplay
              prompt={tokenUsage.prompt_tokens}
              completion={tokenUsage.completion_tokens}
              cost={tokenUsage.estimated_cost}
              source={tokenUsage.usage_source}
            />
          )}
        </div>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Rationale */}
        {step.rationale && (
          <div className="rounded-lg bg-tint/[2%] border border-border/20 p-4 text-sm leading-relaxed">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-2 font-medium">Agent Rationale</p>
            <p className="text-foreground/80 whitespace-pre-wrap">{step.rationale}</p>
          </div>
        )}

        {/* Diff / Editor */}
        {editing ? (
          <div className="monaco-container">
            <Suspense fallback={<div className="h-96 flex items-center justify-center text-muted-foreground/40 text-sm">Loading editor...</div>}>
              <MonacoEditor
                height="400px"
                language="python"
                theme={isDark ? "vs-dark" : "light"}
                value={editedCode}
                onChange={(v) => setEditedCode(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", lineNumbers: "on", scrollBeyondLastLine: false }}
              />
            </Suspense>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-border/20">
            <Suspense fallback={<div className="h-60 flex items-center justify-center text-muted-foreground/40 text-sm">Loading diff...</div>}>
              <ReactDiffViewer
                oldValue={originalCode ?? ""}
                newValue={patchedCode}
                splitView
                useDarkTheme={isDark}
                styles={{
                  contentText: { fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" },
                }}
              />
            </Suspense>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2.5 pt-1">
          <Button
            onClick={onApprove}
            className="gap-2 bg-emerald-600/80 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/10 active:scale-95 transition-all"
          >
            <Check className="h-4 w-4" />
            Approve
            <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-emerald-900/40 rounded font-mono">A</kbd>
          </Button>
          <Button
            variant="destructive"
            onClick={onReject}
            className="gap-2 active:scale-95 transition-transform"
          >
            <X className="h-4 w-4" />
            Reject
            <kbd className="ml-1 px-1 py-0.5 text-[10px] bg-red-900/40 rounded font-mono">R</kbd>
          </Button>
          {onEdit && (
            <Button
              variant="outline"
              onClick={() => {
                if (editing) {
                  onEdit(editedCode);
                  setEditing(false);
                } else {
                  setEditing(true);
                }
              }}
              className="gap-2 border-border/40 hover:border-primary/30 hover:text-primary active:scale-95 transition-all"
            >
              <Pencil className="h-4 w-4" />
              {editing ? "Save & Apply" : "Edit"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
