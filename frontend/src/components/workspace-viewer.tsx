import { useState } from "react";
import { useWorkspaceFiles } from "@/hooks/use-queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runs } from "@/lib/api";
import { FilePreviewModal } from "@/components/file-preview-modal";
import {
  FileText, ChevronDown, ChevronRight, GitBranch, FolderOpen, Code,
} from "lucide-react";

export function WorkspaceViewer({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
  const { data } = useWorkspaceFiles(projectId, runId);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const updateProgram = useMutation({
    mutationFn: (content: string) => runs.updateProgram(projectId, runId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace-files", runId] }),
  });
  const updateTrainPy = useMutation({
    mutationFn: (content: string) => runs.updateTrainPy(projectId, runId, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace-files", runId] }),
  });

  if (!data) return null;

  const toggle = (name: string) => {
    setExpandedFile((prev) => (prev === name ? null : name));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-3.5 w-3.5 text-amber-400" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          Workspace
        </p>
      </div>

      {/* Git info */}
      <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 space-y-1">
        {data.git_branch && (
          <div className="flex items-center gap-2 text-[11px]">
            <GitBranch className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Branch:</span>
            <span className="font-mono text-muted-foreground">{data.git_branch}</span>
          </div>
        )}
        {data.current_commit && (
          <div className="flex items-center gap-2 text-[11px]">
            <Code className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">HEAD:</span>
            <span className="font-mono text-muted-foreground">{data.current_commit.slice(0, 7)}</span>
          </div>
        )}
        {data.best_commit && (
          <div className="flex items-center gap-2 text-[11px]">
            <Code className="h-3 w-3 text-emerald-400/60" />
            <span className="text-muted-foreground">Best:</span>
            <span className="font-mono text-emerald-400/80">{data.best_commit.slice(0, 7)}</span>
          </div>
        )}
      </div>

      {/* Key files */}
      {Object.entries(data.files).map(([name, content]) => (
        <FileEntry
          key={name}
          name={name}
          content={content}
          expanded={expandedFile === name}
          onToggle={() => toggle(name)}
          onOpen={() => setPreviewFile(name)}
          important
        />
      ))}

      {/* Other files */}
      {data.notable_files.length > 0 && (
        <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            Other files
          </p>
          <div className="flex flex-wrap gap-1">
            {data.notable_files.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-mono text-muted-foreground"
              >
                <FileText className="h-2.5 w-2.5" />
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* File preview modal */}
      {previewFile && data.files[previewFile] != null && (
        <FilePreviewModal
          open
          onClose={() => setPreviewFile(null)}
          filename={previewFile}
          content={data.files[previewFile]!}
          onSave={(content) => {
            if (previewFile === "program.md") updateProgram.mutate(content);
            else if (previewFile === "train.py") updateTrainPy.mutate(content);
          }}
        />
      )}
    </div>
  );
}

function FileEntry({
  name,
  content,
  expanded,
  onToggle,
  onOpen,
  important,
}: {
  name: string;
  content: string | null;
  expanded: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  important?: boolean;
}) {
  if (content == null) return null;

  const lineCount = content.split("\n").length;
  const charCount = content.length;
  const preview = content.slice(0, 120).replace(/\n/g, " ").trim();

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${
        important
          ? "bg-muted/50 border-border"
          : "bg-muted/50 border-border"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={onToggle}
          className="shrink-0 hover:bg-accent rounded p-0.5 transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={onOpen}
          className="flex items-center gap-2 flex-1 min-w-0 hover:bg-accent rounded px-1 py-0.5 transition-colors text-left"
        >
          <FileText
            className={`h-3 w-3 shrink-0 ${
              name === "program.md"
                ? "text-blue-400"
                : name === "train.py"
                ? "text-amber-400"
                : "text-muted-foreground"
            }`}
          />
          <span className="text-[11px] font-mono font-medium text-foreground">
            {name}
          </span>
        </button>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
          {lineCount}L · {charCount > 1000 ? `${(charCount / 1000).toFixed(1)}k` : charCount} chars
        </span>
      </div>

      {!expanded && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            {preview}
          </p>
        </div>
      )}

      {expanded && (
        <div className="border-t border-border">
          <pre className="px-3 py-2 text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
