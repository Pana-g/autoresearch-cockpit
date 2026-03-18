import { useState, useRef, useEffect, useCallback } from "react";
import { useCreateNote, useNotes, useDeleteNote, useUpdateNote } from "@/hooks/use-queries";
import { Send, MessageSquare, X, CheckCircle, Clock, ChevronRight, ChevronDown, Pencil, Save } from "lucide-react";
import { notes as notesApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RunNote } from "@/lib/types";

export function MessageComposer({ runId }: { runId: string }) {
  const [message, setMessage] = useState("");
  const createNote = useCreateNote(runId);
  const deleteNote = useDeleteNote(runId);
  const updateNote = useUpdateNote(runId);
  const { data: notesList } = useNotes(runId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    createNote.mutate(trimmed);
    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleToggle = async (noteId: string, currentActive: boolean) => {
    await notesApi.toggle(runId, noteId, !currentActive);
    qc.invalidateQueries({ queryKey: ["notes", runId] });
  };

  const handleEdit = useCallback((note: RunNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
    setExpandedId(note.id);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editContent.trim()) return;
    updateNote.mutate(
      { noteId: editingId, content: editContent.trim() },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success("Note updated");
        },
      },
    );
  }, [editingId, editContent, updateNote]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditContent("");
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const activeNotes = notesList?.filter((n) => n.active) ?? [];
  const deliveredNotes = notesList?.filter((n) => !n.active && n.delivered_at) ?? [];

  const toggleExpand = (id: string) => {
    if (editingId === id) return;
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="h-3.5 w-3.5 text-violet-400" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          Agent Messages
        </p>
        {(activeNotes.length + deliveredNotes.length) > 0 && (
          <span className="ml-auto text-[10px] font-mono text-muted-foreground">
            {activeNotes.length + deliveredNotes.length}
          </span>
        )}
      </div>

      {/* Compose area */}
      <div className="rounded-lg bg-muted/50 border border-border overflow-hidden focus-within:border-violet-500/40 transition-colors">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a hint or instruction to the agent..."
          rows={2}
          className="w-full bg-transparent text-xs text-foreground/90 placeholder:text-muted-foreground px-3 pt-2.5 pb-1 resize-none focus:outline-none font-mono leading-relaxed"
        />
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-[10px] text-muted-foreground font-mono">
            {message.length > 0 ? `⌘↵ to send` : ""}
          </span>
          <button
            onClick={handleSend}
            disabled={!message.trim() || createNote.isPending}
            className="h-6 w-6 rounded-md bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-90"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Active notes (pending delivery) */}
      {activeNotes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-amber-400/60 font-mono flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> queued for next iteration
          </p>
          {activeNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              expanded={expandedId === note.id}
              editing={editingId === note.id}
              editContent={editContent}
              onToggleExpand={() => toggleExpand(note.id)}
              onEdit={() => handleEdit(note)}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onEditChange={setEditContent}
              onDelete={() => deleteNote.mutate(note.id)}
              variant="active"
            />
          ))}
        </div>
      )}

      {/* Delivered notes */}
      {deliveredNotes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-emerald-400/50 font-mono flex items-center gap-1.5">
            <CheckCircle className="h-3 w-3" /> delivered
          </p>
          {deliveredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              expanded={expandedId === note.id}
              editing={false}
              editContent=""
              onToggleExpand={() => toggleExpand(note.id)}
              onDelete={() => deleteNote.mutate(note.id)}
              variant="delivered"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  expanded,
  editing,
  editContent,
  onToggleExpand,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onEditChange,
  onDelete,
  variant,
}: {
  note: RunNote;
  expanded: boolean;
  editing: boolean;
  editContent: string;
  onToggleExpand: () => void;
  onEdit?: () => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onEditChange?: (v: string) => void;
  onDelete: () => void;
  variant: "active" | "delivered";
}) {
  const editRef = useRef<HTMLTextAreaElement>(null);
  const isActive = variant === "active";
  const lines = note.content.split("\n");
  const preview = lines.slice(0, 2).join("\n");
  const hasMore = lines.length > 2 || preview.length > 120;
  const truncatedPreview = preview.length > 120 ? preview.slice(0, 120) + "…" : preview;

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.style.height = "auto";
      editRef.current.style.height = `${editRef.current.scrollHeight}px`;
    }
  }, [editing]);

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSaveEdit?.();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancelEdit?.();
    }
  };

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${
        isActive
          ? "bg-violet-500/[4%] border-violet-500/15"
          : "bg-muted/50 border-border opacity-60"
      }`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <button
          onClick={onToggleExpand}
          className="shrink-0 hover:bg-accent rounded p-0.5 transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left"
        >
          {!expanded && (
            <p className="text-[11px] font-mono text-foreground/65 truncate leading-snug">
              {truncatedPreview.replace(/\n/g, " ↵ ")}
            </p>
          )}
          {expanded && !editing && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {lines.length} line{lines.length !== 1 ? "s" : ""}
            </span>
          )}
          {editing && (
            <span className="text-[10px] text-violet-400/60 font-mono">editing</span>
          )}
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {isActive && !editing && (
            <button
              onClick={onEdit}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-violet-400 hover:bg-violet-500/10 transition-all"
              title="Edit"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={onSaveEdit}
                className="h-5 w-5 rounded flex items-center justify-center text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                title="Save (⌘↵)"
              >
                <Save className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={onCancelEdit}
                className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                title="Cancel (Esc)"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </>
          )}
          <button
            onClick={onDelete}
            className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Delete"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          {editing ? (
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => {
                onEditChange?.(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={handleEditKeyDown}
              className="w-full bg-transparent text-[11px] font-mono text-foreground leading-relaxed px-3 py-2 resize-none focus:outline-none min-h-[60px]"
              spellCheck={false}
            />
          ) : (
            <pre className="px-3 py-2 text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
              {note.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
