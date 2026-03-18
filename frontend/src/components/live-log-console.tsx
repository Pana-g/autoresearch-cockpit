import { useEffect, useRef, useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { Pause, Play, Terminal } from "lucide-react";

const MAX_VISIBLE_LINES = 500;

export function LiveLogConsole({ onCancel }: { onCancel?: () => void }) {
  const { trainingLog } = useUIStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Only render the tail to keep DOM size bounded
  const visibleLines = useMemo(() => {
    if (trainingLog.length <= MAX_VISIBLE_LINES) return trainingLog;
    return trainingLog.slice(-MAX_VISIBLE_LINES);
  }, [trainingLog]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [trainingLog.length, autoScroll]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <div className="h-5 w-5 rounded-md bg-violet-500/10 flex items-center justify-center">
            <Terminal className="h-3 w-3 text-violet-400" />
          </div>
          <span className="uppercase tracking-wider font-medium text-muted-foreground">Training Output</span>
          <span className="font-mono text-muted-foreground">{trainingLog.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded-md transition-colors ${autoScroll ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
            title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          >
            {autoScroll ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>
          {onCancel && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[11px] px-2.5 active:scale-95 transition-transform"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Log output */}
      <ScrollArea className="flex-1 p-0">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="p-4 font-mono text-[12px] leading-5 text-zinc-400 overflow-auto max-h-[500px]"
        >
          {visibleLines.length === 0 && (
            <div className="flex items-center gap-2 text-muted-foreground italic">
              <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse-dot" />
              Waiting for training output...
            </div>
          )}
          {trainingLog.length > MAX_VISIBLE_LINES && (
            <div className="text-muted-foreground text-[11px] mb-1">
              … {trainingLog.length - MAX_VISIBLE_LINES} earlier lines truncated
            </div>
          )}
          {visibleLines.map((line, i) => {
            const isBpb = /val_bpb/i.test(line);
            return (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all ${isBpb ? "log-line-bpb pl-2 text-emerald-300" : ""}`}
              >
                {line}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
