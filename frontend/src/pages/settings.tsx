import { useState } from "react";
import { useRuntimeSettings, useUpdateRuntimeSettings } from "@/hooks/use-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/number-input";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Settings, Timer, Brain, Layers, Eye, EyeOff, Save, Loader2, ShieldCheck, Clock,
} from "lucide-react";

export default function SettingsPage() {
  const { data: settings, isLoading } = useRuntimeSettings();
  const updateSettings = useUpdateRuntimeSettings();

  const [trainingTimeout, setTrainingTimeout] = useState<number | null>(null);
  const [agentTimeout, setAgentTimeout] = useState<number | null>(null);
  const [maxMemory, setMaxMemory] = useState<number | null>(null);
  const [encryptionKey, setEncryptionKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync local state on first load
  const initialized = settings && trainingTimeout === null && agentTimeout === null && maxMemory === null;
  if (initialized) {
    setTrainingTimeout(settings.default_training_timeout_seconds);
    setAgentTimeout(settings.default_agent_inactivity_timeout);
    setMaxMemory(settings.max_run_memory_records);
  }

  const handleSave = () => {
    const body: Record<string, number | string> = {};
    if (trainingTimeout !== null && trainingTimeout !== settings?.default_training_timeout_seconds) {
      body.default_training_timeout_seconds = trainingTimeout;
    }
    if (agentTimeout !== null && agentTimeout !== settings?.default_agent_inactivity_timeout) {
      body.default_agent_inactivity_timeout = agentTimeout;
    }
    if (maxMemory !== null && maxMemory !== settings?.max_run_memory_records) {
      body.max_run_memory_records = maxMemory;
    }
    if (encryptionKey) {
      body.encryption_key = encryptionKey;
    }
    if (Object.keys(body).length === 0) {
      toast.info("No changes to save");
      return;
    }
    updateSettings.mutate(body, {
      onSuccess: () => {
        toast.success("Settings updated");
        setDirty(false);
        setEncryptionKey("");
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    });
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Settings className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground">Runtime configuration — changes apply immediately</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Timeouts Section */}
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-violet-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeouts</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                  Training Timeout
                </Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Timer className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                  <NumberInput
                    integer
                    min={60}
                    className="h-9 text-sm font-mono bg-muted/50 border-border"
                    value={trainingTimeout}
                    placeholder="720"
                    onCommit={(val) => { setTrainingTimeout(val); setDirty(true); }}
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">seconds</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Max time for training subprocess ({trainingTimeout ? `${Math.round(trainingTimeout / 60)} min` : "—"})
                </p>
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                  Agent Timeout
                </Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Brain className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <NumberInput
                    integer
                    min={30}
                    className="h-9 text-sm font-mono bg-muted/50 border-border"
                    value={agentTimeout}
                    placeholder="300"
                    onCommit={(val) => { setAgentTimeout(val); setDirty(true); }}
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">seconds</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Max no-output time before agent is killed ({agentTimeout ? `${Math.round(agentTimeout / 60)} min` : "—"})
                </p>
              </div>
            </div>
          </div>

          {/* Memory Section */}
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-orange-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Memory</p>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                Max Memory Records
              </Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Layers className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <NumberInput
                  integer
                  min={1}
                  max={50}
                  className="h-9 w-24 text-sm font-mono bg-muted/50 border-border"
                  value={maxMemory}
                  placeholder="5"
                  onCommit={(val) => { setMaxMemory(val); setDirty(true); }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Records kept before context compaction triggers
              </p>
            </div>
          </div>

          {/* Encryption Key Section */}
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Security</p>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                Encryption Key
              </Label>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="relative flex-1">
                  <Input
                    className="h-9 text-sm font-mono bg-muted/50 border-border pr-8"
                    type={showKey ? "text" : "password"}
                    placeholder={settings.encryption_key_set ? "••••••••  (set)" : "Not set — paste Fernet key"}
                    value={encryptionKey}
                    onChange={(e) => { setEncryptionKey(e.target.value); setDirty(true); }}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Fernet key used to encrypt stored API credentials. Generate with:
                <code className="ml-1 px-1 py-0.5 bg-muted rounded text-[9px]">
                  python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
                </code>
              </p>
            </div>
          </div>

          {/* CORS (read-only display) */}
          <div className="glass rounded-xl p-5 space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">CORS Origins</p>
            <div className="flex flex-wrap gap-1.5">
              {settings.cors_origins.map((origin) => (
                <span
                  key={origin}
                  className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-muted text-muted-foreground border border-border"
                >
                  {origin}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              CORS origins are set via AR_CORS_ORIGINS env var and require a server restart to change.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button
              className="gap-2 active:scale-95 transition-all"
              disabled={!dirty || updateSettings.isPending}
              onClick={handleSave}
            >
              {updateSettings.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
