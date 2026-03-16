import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useConnectionStore, type ServerConnection } from "@/stores/connection-store";
import { checkAuth } from "@/lib/api";
import { motion, AnimatePresence } from "motion/react";
import {
  Server, Plus, Trash2, Check, X, Loader2, Radio, Eye, EyeOff, Pencil, Globe2,
} from "lucide-react";

export default function ServersPage() {
  const { servers, activeServerId, addServer, updateServer, removeServer, setActive } = useConnectionStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Globe2 className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Server Connections</h1>
              <p className="text-xs text-muted-foreground">Manage remote AutoResearch servers</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={<Button size="sm" className="gap-2 h-8 text-xs" />}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Server
            </DialogTrigger>
            <DialogContent className="glass border-border/50 sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm">Add Server Connection</DialogTitle>
              </DialogHeader>
              <ServerForm
                onSave={(data) => {
                  addServer(data);
                  setDialogOpen(false);
                }}
                onCancel={() => setDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                isActive={server.id === activeServerId}
                onActivate={() => setActive(server.id)}
                onUpdate={(patch) => updateServer(server.id, patch)}
                onRemove={() => removeServer(server.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}


function ServerCard({
  server,
  isActive,
  onActivate,
  onUpdate,
  onRemove,
}: {
  server: ServerConnection;
  isActive: boolean;
  onActivate: () => void;
  onUpdate: (patch: Partial<Omit<ServerConnection, "id">>) => void;
  onRemove: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "auth_needed" | "fail" | null>(null);
  const [editing, setEditing] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await checkAuth(server.url, server.apiKey);
      if (result.authenticated) {
        setTestResult("ok");
      } else {
        setTestResult("auth_needed");
      }
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`glass rounded-xl p-4 transition-all ${
        isActive ? "ring-1 ring-primary/30 shadow-lg shadow-primary/5" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onActivate}
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
              isActive
                ? "bg-primary/15 text-primary glow-teal"
                : "bg-tint/[3%] text-muted-foreground hover:bg-tint/[6%] hover:text-foreground"
            }`}
          >
            {isActive ? <Radio className="h-4 w-4" /> : <Server className="h-4 w-4" />}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{server.label}</p>
              {isActive && (
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-primary/30 text-primary">
                  ACTIVE
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-mono truncate">{server.url}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {server.apiKey ? "🔐 API key set" : "🔓 No auth"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {testResult === "ok" && <Check className="h-4 w-4 text-emerald-400" />}
          {testResult === "auth_needed" && (
            <Tooltip>
              <TooltipTrigger><X className="h-4 w-4 text-amber-400" /></TooltipTrigger>
              <TooltipContent><p className="text-xs">Auth required — set an API key</p></TooltipContent>
            </Tooltip>
          )}
          {testResult === "fail" && (
            <Tooltip>
              <TooltipTrigger><X className="h-4 w-4 text-red-400" /></TooltipTrigger>
              <TooltipContent><p className="text-xs">Server unreachable</p></TooltipContent>
            </Tooltip>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground/50 hover:text-foreground"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>

          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogTrigger
              render={<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground" />}
            >
              <Pencil className="h-3.5 w-3.5" />
            </DialogTrigger>
            <DialogContent className="glass border-border/50 sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm">Edit Server</DialogTitle>
              </DialogHeader>
              <ServerForm
                initial={server}
                onSave={(data) => {
                  onUpdate(data);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            </DialogContent>
          </Dialog>

          {server.id !== "local" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground/50 hover:text-red-400"
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}


function ServerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ServerConnection>;
  onSave: (data: Omit<ServerConnection, "id">) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "http://");
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "auth_needed" | "fail" | null>(null);

  const normalizedUrl = url.replace(/\/+$/, "");
  const baseUrl = normalizedUrl.endsWith("/api") ? normalizedUrl : `${normalizedUrl}/api`;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await checkAuth(baseUrl, apiKey);
      setTestResult(result.authenticated ? "ok" : "auth_needed");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div>
        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Label</Label>
        <Input
          className="mt-1.5 h-9 text-sm bg-tint/[3%] border-border/50"
          placeholder="My Remote Server"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Server URL</Label>
        <Input
          className="mt-1.5 h-9 text-sm font-mono bg-tint/[3%] border-border/50"
          placeholder="http://192.168.1.50:8000"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Base URL of the AutoResearch backend (e.g. http://host:8000)
        </p>
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">API Key <span className="text-destructive">*</span></Label>
        <div className="flex gap-2 mt-1.5">
          <div className="relative flex-1">
            <Input
              className="h-9 text-sm font-mono bg-tint/[3%] border-border/50 pr-8"
              type={showKey ? "text" : "password"}
              placeholder="Required"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Set AR_API_KEY on the server to require authentication
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={handleTest}
          disabled={testing || !url}
        >
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Test Connection
        </Button>
        {testResult === "ok" && <span className="text-[11px] text-emerald-400">Connected</span>}
        {testResult === "auth_needed" && <span className="text-[11px] text-amber-400">Auth required — check API key</span>}
        {testResult === "fail" && <span className="text-[11px] text-red-400">Unreachable</span>}
      </div>

      <div className="sep-gradient" />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled={!label.trim() || !url.trim() || !apiKey.trim()}
          onClick={() => onSave({ label: label.trim(), url: baseUrl, apiKey })}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
