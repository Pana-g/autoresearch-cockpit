import { useState } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { checkConnection } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Server, Loader2, CheckCircle2, XCircle, Zap,
} from "lucide-react";
import { motion } from "framer-motion";

export function WelcomeSetup() {
  const { addServer, setActive, completeSetup } = useConnectionStore();

  // Derive default server URL from current browser location
  const defaultUrl = `${window.location.protocol}//${window.location.hostname}:8000`;

  const [label, setLabel] = useState("Local");
  const [url, setUrl] = useState(defaultUrl);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  const normalizedUrl = url.replace(/\/+$/, "");
  const baseUrl = normalizedUrl.endsWith("/api") ? normalizedUrl : `${normalizedUrl}/api`;

  const canSubmit = !!(label.trim() && url.trim());

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await checkConnection(baseUrl);
      setTestResult(result.reachable ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const result = await checkConnection(baseUrl);
      if (!result.reachable) {
        setTestResult("fail");
        return;
      }
    } catch {
      setTestResult("fail");
      return;
    } finally {
      setSaving(false);
    }
    const id = addServer({ label: label.trim(), url: baseUrl });
    setActive(id);
    completeSetup();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
            className="inline-flex h-14 w-14 rounded-2xl bg-primary/12 items-center justify-center mb-4"
          >
            <Zap className="h-7 w-7 text-primary" />
          </motion.div>
          <h1 className="text-xl font-semibold tracking-tight">AutoResearch Cockpit</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Connect to a server to get started</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div>
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Label</Label>
            <Input
              className="mt-1.5 h-9 text-sm bg-muted/50 border-border"
              placeholder="My Server"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Server URL</Label>
            <Input
              className="mt-1.5 h-9 text-sm font-mono bg-muted/50 border-border"
              placeholder="http://localhost:8000"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setTestResult(null); }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleTest}
              disabled={testing || !url.trim()}
            >
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Server className="h-3 w-3" />}
              Test Connection
            </Button>
            {testResult === "ok" && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium"
              >
                <CheckCircle2 className="h-3 w-3" /> Connected
              </motion.span>
            )}
            {testResult === "fail" && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 text-[11px] text-red-500 font-medium"
              >
                <XCircle className="h-3 w-3" /> Unreachable
              </motion.span>
            )}
          </div>

          <div className="sep-gradient" />

          <Button
            className="w-full h-9 text-sm gap-2"
            disabled={!canSubmit || saving}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Connect &amp; Get Started
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
