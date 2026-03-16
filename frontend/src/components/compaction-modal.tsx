import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCompaction, useApplyCompaction, useUpdateCompaction, useClearCompaction } from "@/hooks/use-queries";
import { Layers, Pencil, Eye, Save, Trash2, Wand2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  runId: string;
}

export function CompactionModal({ open, onClose, projectId, runId }: Props) {
  const { data: compaction, isLoading } = useCompaction(projectId, runId);
  const applyCompaction = useApplyCompaction(projectId, runId);
  const updateCompaction = useUpdateCompaction(projectId, runId);
  const clearCompaction = useClearCompaction(projectId, runId);

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [viewMode, setViewMode] = useState<"current" | "preview">("current");

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setEditing(false);
      setViewMode(compaction?.current_summary ? "current" : "preview");
    }
  }, [open, compaction?.current_summary]);

  const displayContent = editing
    ? editContent
    : viewMode === "current"
      ? compaction?.current_summary ?? ""
      : compaction?.preview_summary ?? "";

  const displayUpTo = viewMode === "current"
    ? compaction?.current_up_to
    : compaction?.preview_up_to;

  const handleEdit = useCallback(() => {
    setEditContent(displayContent);
    setEditing(true);
  }, [displayContent]);

  const handleSave = useCallback(() => {
    const upTo = compaction?.current_up_to ?? compaction?.preview_up_to;
    if (!upTo) return;
    updateCompaction.mutate(
      { summary: editContent, compactedUpTo: upTo },
      {
        onSuccess: () => {
          setEditing(false);
          setViewMode("current");
          toast.success("Compaction updated");
        },
      },
    );
  }, [editContent, compaction, updateCompaction]);

  const handleApply = useCallback(() => {
    applyCompaction.mutate(undefined, {
      onSuccess: () => {
        setViewMode("current");
        toast.success("Compaction applied");
      },
    });
  }, [applyCompaction]);

  const handleClear = useCallback(() => {
    clearCompaction.mutate(undefined, {
      onSuccess: () => {
        setViewMode("preview");
        toast.success("Compaction cleared — using full memory");
      },
    });
  }, [clearCompaction]);

  const hasCurrent = !!compaction?.current_summary;
  const hasPreview = !!compaction?.preview_summary;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditing(false); onClose(); } }}>
      <DialogContent showCloseButton={false} className="sm:max-w-[75vw] max-h-[85vh] flex flex-col glass border-white/[6%] p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md flex items-center justify-center bg-orange-500/10">
              <Layers className="h-3.5 w-3.5 text-orange-400" />
            </div>
            <DialogTitle className="text-sm font-medium">
              Context Compaction
            </DialogTitle>

            <div className="ml-auto flex items-center gap-1.5">
              {hasCurrent && hasPreview && !editing && (
                <div className="flex rounded-md border border-border/30 overflow-hidden mr-2">
                  <button
                    onClick={() => setViewMode("current")}
                    className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                      viewMode === "current"
                        ? "bg-orange-500/15 text-orange-400"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setViewMode("preview")}
                    className={`px-2.5 py-1 text-[10px] font-medium transition-colors border-l border-border/30 ${
                      viewMode === "preview"
                        ? "bg-orange-500/15 text-orange-400"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    }`}
                  >
                    Preview
                  </button>
                </div>
              )}

              {!editing && displayContent && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                  onClick={handleEdit}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}

              {editing && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                    onClick={() => setEditing(false)}
                    title="Cancel edit"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-emerald-400/80 hover:text-emerald-400"
                    onClick={handleSave}
                    disabled={updateCompaction.isPending}
                    title="Save"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                onClick={onClose}
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className={`flex-1 ${editing ? "overflow-hidden" : "overflow-auto"}`}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
            </div>
          ) : editing ? (
            <textarea
              className="w-full h-full min-h-[60vh] p-5 bg-transparent text-sm font-mono text-foreground/90 resize-none focus:outline-none overflow-auto"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
            />
          ) : displayContent ? (
            <div className="p-5 text-sm font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {displayContent}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Layers className="h-8 w-8 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/50">
                {(compaction?.memory_count ?? 0) <= 5
                  ? "Not enough iterations to compact (need > 5)"
                  : "No compaction active"}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-border/20 flex items-center gap-2 shrink-0">
          <div className="text-[10px] text-muted-foreground/50 font-mono">
            {compaction?.memory_count ?? 0} memory records
            {displayUpTo ? ` · compacted up to iter ${displayUpTo}` : ""}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {hasCurrent && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                onClick={handleClear}
                disabled={clearCompaction.isPending}
              >
                <Trash2 className="h-3 w-3 mr-1.5" />
                Clear
              </Button>
            )}
            {hasPreview && viewMode === "preview" && !editing && (
              <Button
                size="sm"
                className="h-7 text-xs bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 border border-orange-500/20"
                onClick={handleApply}
                disabled={applyCompaction.isPending}
              >
                <Wand2 className="h-3 w-3 mr-1.5" />
                Apply Compaction
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
