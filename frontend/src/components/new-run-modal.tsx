import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects, useCreateRun } from "@/hooks/use-queries";
import { ModelSelector } from "@/components/model-selector";
import { ModelChat } from "@/components/model-chat";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Rocket, Play, Timer, Cpu, Layers, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected project ID */
  projectId?: string;
}

export function NewRunModal({ open, onOpenChange, projectId: initialProjectId }: Props) {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const createRun = useCreateRun();

  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [credentialId, setCredentialId] = useState<string>();
  const [maxIterations, setMaxIterations] = useState(0);
  const [includeMachineInfo, setIncludeMachineInfo] = useState(true);
  const [autoCompact, setAutoCompact] = useState(true);
  const [maxConsecutiveFailures, setMaxConsecutiveFailures] = useState(6);

  // Sync when projectId prop changes
  const prevInitial = useState(initialProjectId)[0];
  if (initialProjectId !== prevInitial && initialProjectId) {
    setProjectId(initialProjectId);
  }

  const handleCreate = () => {
    if (!projectId || !provider || !model) return;
    createRun.mutate(
      { projectId, provider, model, credential_id: credentialId, max_iterations: maxIterations, include_machine_info: includeMachineInfo, auto_compact: autoCompact, max_consecutive_failures: maxConsecutiveFailures },
      {
        onSuccess: (run) => {
          onOpenChange(false);
          navigate(`/projects/${projectId}/runs/${run.id}`);
        },
      },
    );
  };

  const resetAndClose = (v: boolean) => {
    if (!v) {
      setProvider("");
      setModel("");
      setCredentialId(undefined);
      setMaxIterations(0);
      setIncludeMachineInfo(true);
      createRun.reset();
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="glass border-border sm:max-w-lg overflow-y-auto max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Rocket className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold">New Run</DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">Configure and launch an experiment</p>
            </div>
          </div>
        </DialogHeader>

        <div className="sep-gradient -mx-4" />

        <div className="space-y-5 pt-1">
          {/* Project picker — only show if no pre-selected project */}
          {!initialProjectId && (
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
          )}

          <ModelSelector
            provider={provider}
            model={model}
            credentialId={credentialId}
            onProviderChange={(v) => { setProvider(v); setModel(""); }}
            onModelChange={setModel}
            onCredentialChange={setCredentialId}
          />

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

          <div className="flex items-center justify-between gap-4 py-1">
            <div className="flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Hardware Detection</p>
                <p className="text-[10px] text-muted-foreground">Send machine specs to agent for hyperparameter tuning</p>
              </div>
            </div>
            <Switch
              checked={includeMachineInfo}
              onCheckedChange={(v) => setIncludeMachineInfo(!!v)}
            />
          </div>

          <div className="flex items-center justify-between gap-4 py-1">
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Auto Compact</p>
                <p className="text-[10px] text-muted-foreground">Automatically compact context when threshold is reached</p>
              </div>
            </div>
            <Switch
              checked={autoCompact}
              onCheckedChange={(v) => setAutoCompact(!!v)}
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block font-medium">
              <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />Max Consecutive Failures
            </label>
            <div className="flex items-center gap-2">
              <NumberInput
                integer
                min={1}
                className="h-9 text-sm bg-muted/50 border-border focus:border-primary/40 transition-colors font-mono"
                value={maxConsecutiveFailures}
                placeholder="6"
                onCommit={(val) => setMaxConsecutiveFailures(val ?? 6)}
              />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">consecutive failures before stopping</span>
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
      </DialogContent>
    </Dialog>
  );
}
