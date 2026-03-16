import { useState } from "react";
import { Link } from "react-router-dom";
import { useProjects, useCreateProject, useDeleteProject } from "@/hooks/use-queries";
import { useConnectionStore } from "@/stores/connection-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDistanceToNow } from "@/lib/format";
import { FolderOpen, Plus, Trash2, ChevronRight, Beaker, Server } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [description, setDescription] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const activeServer = useConnectionStore((s) => s.getActive());

  const handleCreate = () => {
    if (!name || !sourcePath) return;
    createProject.mutate(
      { name, source_path: sourcePath, description },
      { onSuccess: () => { setShowCreate(false); setName(""); setSourcePath(""); setDescription(""); } },
    );
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-end justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Server className="h-3 w-3" />
            <span className="font-mono text-xs">{activeServer.label}</span>
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="gap-2 bg-primary/90 hover:bg-primary text-primary-foreground shadow-lg shadow-primary/10 active:scale-95 transition-all duration-150"
        >
          <Plus className="h-4 w-4" />
          Import Project
        </Button>
      </motion.div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="glass rounded-xl p-5 space-y-3">
              <p className="text-xs font-medium text-primary uppercase tracking-wider mb-1">New Project</p>
              <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm bg-tint/[3%] border-border/50 focus:border-primary/40 transition-colors" />
              <Input placeholder="/path/to/autoresearch/workspace" value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} className="h-9 text-sm font-mono bg-tint/[3%] border-border/50 focus:border-primary/40 transition-colors" />
              <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 text-sm bg-tint/[3%] border-border/50 focus:border-primary/40 transition-colors" />
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleCreate} disabled={!name || !sourcePath || createProject.isPending} className="active:scale-95 transition-transform">
                  {createProject.isPending ? "Creating..." : "Create"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="text-muted-foreground">Cancel</Button>
              </div>
              {createProject.isError && (
                <p className="text-xs text-red-400">{(createProject.error as Error).message}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl glass animate-shimmer" />
          ))}
        </div>
      )}

      {/* Project Cards */}
      <div className="space-y-3">
        {projects?.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <Link
              to={`/projects/${p.id}`}
              className="group flex items-center gap-5 rounded-xl glass px-5 py-4 card-hover transition-all duration-200 hover:border-primary/20"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold group-hover:text-primary transition-colors">{p.name}</p>
                {p.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>}
                <p className="text-[11px] font-mono text-muted-foreground/60 truncate mt-0.5">{p.source_path}</p>
              </div>
              <span className="text-[11px] text-muted-foreground/60 font-mono shrink-0">{formatDistanceToNow(p.created_at)}</span>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteId(p.id); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all duration-150 p-1.5 rounded-md hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0 transition-colors" />
            </Link>
          </motion.div>
        ))}

        {/* Empty State */}
        {projects?.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="h-16 w-16 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-4">
              <Beaker className="h-8 w-8 text-primary/40" />
            </div>
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Import a workspace to start running experiments</p>
            <Button
              onClick={() => setShowCreate(true)}
              variant="outline"
              size="sm"
              className="mt-4 gap-2 border-dashed border-primary/30 text-primary hover:bg-primary/5"
            >
              <Plus className="h-3.5 w-3.5" />
              Import Project
            </Button>
          </motion.div>
        )}
      </div>

      {deleteId && (
        <ConfirmDialog
          open
          title="Delete Project"
          description="This will delete the project record. Source files will not be affected."
          variant="destructive"
          confirmLabel="Delete"
          onClose={() => setDeleteId(null)}
          onConfirm={() => { deleteProject.mutate(deleteId); setDeleteId(null); }}
        />
      )}
    </div>
  );
}
