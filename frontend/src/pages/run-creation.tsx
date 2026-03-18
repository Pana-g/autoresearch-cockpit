import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProjects, useCreateRun } from "@/hooks/use-queries";
import { ModelSelector } from "@/components/model-selector";
import { ModelChat } from "@/components/model-chat";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Rocket, Play, Timer } from "lucide-react";
import { motion } from "motion/react";

export default function RunCreationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedProject = searchParams.get("project") ?? "";

  const { data: projects } = useProjects();
  const createRun = useCreateRun();

  const [projectId, setProjectId] = useState(preselectedProject);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [credentialId, setCredentialId] = useState<string>();
  const [maxIterations, setMaxIterations] = useState(0);

  const handleCreate = () => {
    if (!projectId || !provider || !model) return;
    createRun.mutate(
      { projectId, provider, model, credential_id: credentialId, max_iterations: maxIterations },
      { onSuccess: (run) => navigate(`/projects/${projectId}/runs/${run.id}`) },
    );
  };

  return (
    <div className="p-8 max-w-xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass rounded-xl overflow-hidden"
      >
        {/* Header with gradient accent */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Create New Run</h2>
              <p className="text-xs text-muted-foreground">Configure and launch an experiment</p>
            </div>
          </div>
        </div>

        <div className="sep-gradient" />

        {/* Form */}
        <div className="p-6 space-y-5">
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">Project</label>
            <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
              <SelectTrigger className="h-9 text-sm bg-muted/50 border-border focus:border-primary/40 transition-colors">
                <SelectValue placeholder="Select a project">
                  {projects?.find((p) => p.id === projectId)?.name ?? "Select a project"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-sm">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ModelSelector
            provider={provider}
            model={model}
            credentialId={credentialId}
            onProviderChange={(v) => { setProvider(v); setModel(""); }}
            onModelChange={setModel}
            onCredentialChange={setCredentialId}
          />

          {/* Test Model Chat */}
          <ModelChat provider={provider} model={model} credentialId={credentialId} />

          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">
              <Timer className="h-3 w-3 inline mr-1 -mt-0.5" />Max Iterations
            </label>
            <div className="flex items-center gap-2">
              <NumberInput
                integer
                className="h-9 text-sm bg-muted/50 border-border focus:border-primary/40 transition-colors font-mono"
                value={maxIterations || ""}
                placeholder="Unlimited"
                onCommit={(val) => setMaxIterations(val ?? 0)}
              />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">0 = unlimited</span>
            </div>
          </div>

          <div className="sep-gradient" />

          <Button
            className="w-full gap-2 h-10 bg-primary/90 hover:bg-primary text-primary-foreground shadow-sm active:scale-[0.98] transition-all"
            disabled={!projectId || !provider || !model || createRun.isPending}
            onClick={handleCreate}
          >
            <Play className="h-4 w-4" />
            {createRun.isPending ? "Creating..." : "Create Run"}
          </Button>

          {createRun.isError && (
            <p className="text-xs text-red-400 text-center">{(createRun.error as Error).message}</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
