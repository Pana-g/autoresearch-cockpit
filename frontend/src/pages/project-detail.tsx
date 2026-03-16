import { useRef, useCallback, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useProject, useRuns } from "@/hooks/use-queries";
import { StatusBadge } from "@/components/status-badge";
import { NewRunModal } from "@/components/new-run-modal";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "@/lib/format";
import { Plus, ChevronRight, Play, FolderOpen, Activity, Hash, Target, Loader2, Settings } from "lucide-react";
import { motion } from "motion/react";
import type { RunState } from "@/lib/types";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project } = useProject(projectId!);
  const { data: runsData, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useRuns(projectId!);
  const runs = useMemo(() => runsData?.pages.flat() ?? [], [runsData]);
  const [newRunOpen, setNewRunOpen] = useState(false);

  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();
      if (!node || !hasNextPage) return;
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) fetchNextPage();
      });
      observer.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  if (!project) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const activeRuns = runs.filter((r) => !["done", "failed", "canceled"].includes(r.state)).length;
  const bestBpb = project.best_val_bpb;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Project Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 glow-teal">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              {project.description && <p className="text-sm text-muted-foreground mt-1">{project.description}</p>}
              <p className="text-[11px] font-mono text-muted-foreground/50 mt-1">{project.source_path}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
          <Button
            onClick={() => setNewRunOpen(true)}
            className="gap-2 bg-primary/90 hover:bg-primary text-primary-foreground shadow-lg shadow-primary/10 active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" /> New Run
          </Button>
          <Link to={`/projects/${projectId}/settings`}>
            <Button
              variant="outline"
              className="h-9 gap-2 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" /> Settings
            </Button>
          </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-6 mt-6">
          <div className="glass rounded-lg px-4 py-3 flex items-center gap-3">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Runs</p>
              <p className="text-lg font-mono font-semibold leading-none mt-0.5">{runs.length}</p>
            </div>
          </div>
          <div className="glass rounded-lg px-4 py-3 flex items-center gap-3">
            <Activity className="h-4 w-4 text-cyan-400" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
              <p className="text-lg font-mono font-semibold leading-none mt-0.5">{activeRuns}</p>
            </div>
          </div>
          {bestBpb != null && (
            <div className="glass rounded-lg px-4 py-3 flex items-center gap-3">
              <Target className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best bpb</p>
                <p className="text-lg font-mono font-semibold leading-none mt-0.5 text-emerald-400">{bestBpb.toFixed(4)}</p>
                {project.best_run_id && project.best_iteration != null && (
                  <Link
                    to={`/projects/${projectId}/runs/${project.best_run_id}`}
                    className="text-[10px] font-mono text-muted-foreground/50 hover:text-primary/70 transition-colors mt-1 inline-block"
                  >
                    run {project.best_run_id.slice(0, 8)} · iter #{project.best_iteration}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <div className="sep-gradient" />

      {/* Runs Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Runs</h2>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl glass animate-shimmer" />
          ))}
        </div>
      )}

      {/* Run List */}
      <div className="space-y-2.5">
        {runs.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.04 }}
          >
            <Link
              to={`/projects/${projectId}/runs/${r.id}`}
              className="group flex items-center gap-4 rounded-xl glass px-5 py-3.5 card-hover transition-all duration-200 hover:border-primary/20"
            >
              <StatusBadge state={r.state as RunState} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-foreground/70">{r.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-mono">{r.provider}/{r.model}</span>
                  <span className="mx-1.5 text-muted-foreground/30">·</span>
                  iter {r.iteration}
                  {r.best_val_bpb != null && (
                    <>
                      <span className="mx-1.5 text-muted-foreground/30">·</span>
                      <span className="text-emerald-400 font-mono">bpb {r.best_val_bpb.toFixed(4)}</span>
                    </>
                  )}
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground/50 font-mono shrink-0">{formatDistanceToNow(r.created_at)}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 shrink-0 transition-colors" />
            </Link>
          </motion.div>
        ))}

        {/* Infinite scroll sentinel */}
        {hasNextPage && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {isFetchingNextPage && <Loader2 className="h-5 w-5 text-muted-foreground/40 animate-spin" />}
          </div>
        )}

        {/* Empty state */}
        {runs.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="h-14 w-14 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-4">
              <Play className="h-7 w-7 text-primary/30" />
            </div>
            <p className="text-sm text-muted-foreground">No runs yet</p>
            <button onClick={() => setNewRunOpen(true)} className="text-xs text-primary hover:text-primary/80 mt-2 inline-block transition-colors">
              Create your first run
            </button>
          </motion.div>
        )}
      </div>

      <NewRunModal open={newRunOpen} onOpenChange={setNewRunOpen} projectId={projectId} />
    </div>
  );
}
