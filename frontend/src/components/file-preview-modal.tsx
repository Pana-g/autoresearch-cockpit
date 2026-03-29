import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Pencil, Eye, Copy, Check, Save, X } from "lucide-react";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { useThemeStore, getEffectiveTheme } from "@/stores/theme-store";

interface Props {
  open: boolean;
  onClose: () => void;
  filename: string;
  content: string;
  onSave?: (content: string) => void;
}

function getLanguage(filename: string): string {
  if (filename.endsWith(".py")) return "python";
  if (filename.endsWith(".md")) return "markdown";
  if (filename.endsWith(".json")) return "json";
  if (filename.endsWith(".yaml") || filename.endsWith(".yml")) return "yaml";
  if (filename.endsWith(".sh")) return "shell";
  if (filename.endsWith(".toml")) return "ini";
  return "plaintext";
}

export function FilePreviewModal({ open, onClose, filename, content, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [copied, setCopied] = useState(false);
  const theme = useThemeStore((s) => s.theme);

  const effectiveTheme = getEffectiveTheme(theme);

  const monacoTheme = effectiveTheme === "dark" ? "vs-dark" : "vs";
  const language = getLanguage(filename);
  const isPython = filename.endsWith(".py");

  const handleCopy = useCallback(async () => {
    const text = editing ? editContent : content;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for dialogs where the Clipboard API is blocked
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }, [content, editContent, editing]);

  const handleSave = useCallback(() => {
    onSave?.(editContent);
    setEditing(false);
    toast.success(`${filename} saved`);
  }, [editContent, filename, onSave]);

  const handleToggleEdit = useCallback(() => {
    if (!editing) {
      setEditContent(content);
    }
    setEditing(!editing);
  }, [editing, content]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditing(false); onClose(); } }}>
      <DialogContent showCloseButton={false} className="sm:max-w-[90vw] max-h-[85vh] flex flex-col glass border-border p-0 gap-0" overlayClassName="backdrop-blur-none">
        <DialogHeader className="px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`h-7 w-7 rounded-md flex items-center justify-center ${
              isPython ? "bg-amber-500/10" : "bg-blue-500/10"
            }`}>
              <FileText className={`h-3.5 w-3.5 ${isPython ? "text-amber-400" : "text-blue-400"}`} />
            </div>
            <DialogTitle className="text-sm font-mono font-semibold tracking-tight flex-1">
              {filename}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title={copied ? "Copied" : "Copy to clipboard"}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {onSave && (
                <button
                  onClick={handleToggleEdit}
                  className={`h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors ${
                    editing ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={editing ? "Preview" : "Edit"}
                >
                  {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </button>
              )}
              {editing && (
                <button
                  onClick={handleSave}
                  className="h-7 w-7 rounded-md flex items-center justify-center bg-emerald-600/80 hover:bg-emerald-600 text-white transition-colors"
                  title="Save"
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="w-px h-4 bg-border/30 mx-0.5" />
              <button
                onClick={onClose}
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-[60vh] overflow-hidden">
          <Editor
            height="60vh"
            language={language}
            theme={monacoTheme}
            value={editing ? editContent : content}
            onChange={(v) => { if (editing && v !== undefined) setEditContent(v); }}
            options={{
              readOnly: !editing,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 20,
              scrollBeyondLastLine: false,
              wordWrap: language === "markdown" ? "on" : "off",
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: editing ? "line" : "none",
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              domReadOnly: !editing,
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
