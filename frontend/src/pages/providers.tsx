import { useState, useCallback, useRef, useEffect } from "react";
import { useCredentials, useCreateCredential, useDeleteCredential, useUpdateCredential, useValidateCredential, useProviders } from "@/hooks/use-queries";
import { copilotAuth, credentials as credentialsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatDistanceToNow } from "@/lib/format";
import { Key, Plus, Trash2, CheckCircle, XCircle, Shield, Loader2, Fingerprint, Globe, Copy, ExternalLink, Server, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "text-emerald-400",
  anthropic: "text-orange-400",
  google: "text-blue-400",
  ollama: "text-violet-400",
  "github-copilot": "text-white",
  openrouter: "text-rose-400",
};

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  openai: "GPT-4.1, o3-mini, and more",
  anthropic: "Claude Sonnet, Haiku",
  google: "Gemini 2.5 Pro & Flash",
  ollama: "Local models (no key needed)",
  "github-copilot": "Device auth or proxy",
  openrouter: "Unified API for 200+ models",
};

type AuthMode = "api_key" | "device_auth" | "proxy" | "none";

const PROVIDER_AUTH_MODES: Record<string, AuthMode[]> = {
  openai: ["api_key"],
  anthropic: ["api_key"],
  google: ["api_key"],
  ollama: ["none"],
  "github-copilot": ["device_auth", "proxy"],
  openrouter: ["api_key"],
};

/* ── Device Auth Hook ─────────────────────────────────── */

function useDeviceAuth() {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "waiting"; userCode: string; verificationUri: string; deviceCode: string }
    | { phase: "complete"; accessToken: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    stop();
    setState({ phase: "idle" });
    try {
      const flow = await copilotAuth.startDeviceFlow();
      setState({ phase: "waiting", userCode: flow.user_code, verificationUri: flow.verification_uri, deviceCode: flow.device_code });

      let delay = (flow.interval || 5) * 1000;
      const poll = async () => {
        try {
          const result = await copilotAuth.pollDeviceFlow(flow.device_code);
          if (result.status === "complete" && result.access_token) {
            stop();
            setState({ phase: "complete", accessToken: result.access_token });
            return;
          } else if (result.status === "slow_down") {
            delay = Math.min(delay + 5000, 30000);
          } else if (result.status === "expired" || result.status === "error") {
            stop();
            setState({ phase: "error", message: result.error ?? "Authorization expired or failed" });
            return;
          }
        } catch {
          stop();
          setState({ phase: "error", message: "Polling failed" });
          return;
        }
        pollingRef.current = setTimeout(poll, delay);
      };
      pollingRef.current = setTimeout(poll, delay);
    } catch (e) {
      setState({ phase: "error", message: String(e) });
    }
  }, [stop]);

  // cleanup on unmount
  useEffect(() => stop, [stop]);

  const reset = useCallback(() => { stop(); setState({ phase: "idle" }); }, [stop]);

  return { state, start, reset };
}

/* ── Main Page ────────────────────────────────────────── */

export default function ProvidersPage() {
  const { data: providerList } = useProviders();
  const { data: creds } = useCredentials();
  const createCred = useCreateCredential();
  const deleteCred = useDeleteCredential();
  const updateCred = useUpdateCredential();
  const validateCred = useValidateCredential();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("api_key");
  const [apiKey, setApiKey] = useState("");
  const [proxyUrl, setProxyUrl] = useState("http://localhost:3000/api/v1");
  const [proxyApiKey, setProxyApiKey] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<Record<string, "idle" | "loading" | "valid" | "invalid">>({});
  const [copied, setCopied] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editProxyUrl, setEditProxyUrl] = useState("");
  const [editProxyApiKey, setEditProxyApiKey] = useState("");

  const deviceAuth = useDeviceAuth();

  // Update auth mode when provider changes
  const handleProviderChange = (v: string) => {
    setProvider(v);
    const modes = PROVIDER_AUTH_MODES[v] ?? ["api_key"];
    setAuthMode(modes[0]);
    deviceAuth.reset();
    setApiKey("");
    setProxyUrl("http://localhost:3000/api/v1");
    setProxyApiKey("");
  };

  const handleCreate = () => {
    if (!name || !provider) return;

    let credentials: Record<string, string> = {};
    let auth_type = authMode;

    if (authMode === "api_key") {
      if (apiKey) credentials = { api_key: apiKey };
    } else if (authMode === "device_auth") {
      if (deviceAuth.state.phase !== "complete") return;
      credentials = { github_token: deviceAuth.state.accessToken, mode: "direct" };
      auth_type = "device_auth";
    } else if (authMode === "proxy") {
      credentials = { proxy_base_url: proxyUrl, mode: "proxy" };
      if (proxyApiKey) credentials.api_key = proxyApiKey;
      auth_type = "proxy";
    } else if (authMode === "none") {
      credentials = {};
      auth_type = "none";
    }

    createCred.mutate(
      { name, provider, auth_type: String(auth_type), credentials },
      {
        onSuccess: async (cred) => {
          setShowCreate(false);
          setName("");
          setProvider("");
          setApiKey("");
          setProxyUrl("http://localhost:3000/api/v1");
          setProxyApiKey("");
          deviceAuth.reset();

          // Auto-validate the new credential
          toast.info("Credential saved — validating connection…");
          setValidationState((s) => ({ ...s, [cred.id]: "loading" }));
          try {
            const result = await credentialsApi.validate(cred.id);
            setValidationState((s) => ({ ...s, [cred.id]: result.valid ? "valid" : "invalid" }));
            if (result.valid) {
              toast.success(`${cred.name} connected successfully`);
            } else {
              toast.error(`${cred.name} saved but connection failed — check credentials`);
            }
          } catch {
            setValidationState((s) => ({ ...s, [cred.id]: "invalid" }));
            toast.error(`${cred.name} saved but validation failed`);
          }
        },
        onError: (err) => {
          toast.error(`Failed to save credential: ${err.message}`);
        },
      },
    );
  };

  const handleValidate = async (id: string) => {
    setValidationState((s) => ({ ...s, [id]: "loading" }));
    try {
      const result = await validateCred.mutateAsync(id);
      setValidationState((s) => ({ ...s, [id]: result.valid ? "valid" : "invalid" }));
    } catch {
      setValidationState((s) => ({ ...s, [id]: "invalid" }));
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEdit = (c: { id: string; name: string; auth_type: string; credential_hints: Record<string, string> }) => {
    setEditId(c.id);
    setEditName(c.name);
    setEditApiKey("");
    setEditProxyUrl(c.credential_hints?.proxy_base_url ?? "");
    setEditProxyApiKey("");
  };

  const handleUpdate = (credId: string, authType: string) => {
    const body: { name?: string; credentials?: Record<string, string> } = {};
    if (editName) body.name = editName;

    if (authType === "proxy") {
      if (editProxyUrl || editProxyApiKey) {
        const creds: Record<string, string> = { mode: "proxy" };
        if (editProxyUrl) creds.proxy_base_url = editProxyUrl;
        if (editProxyApiKey) creds.api_key = editProxyApiKey;
        body.credentials = creds;
      }
    } else if (authType === "api_key" || authType === "none") {
      if (editApiKey) body.credentials = { api_key: editApiKey };
    }

    updateCred.mutate(
      { id: credId, ...body },
      {
        onSuccess: () => {
          setEditId(null);
          toast.success("Credential updated");
        },
        onError: (err) => toast.error(`Failed to update: ${err.message}`),
      },
    );
  };

  // Group credentials by provider
  const grouped = new Map<string, typeof creds>();
  creds?.forEach((c) => {
    const list = grouped.get(c.provider) ?? [];
    list.push(c);
    grouped.set(c.provider, list);
  });

  const canSave =
    name &&
    provider &&
    (authMode === "device_auth" ? deviceAuth.state.phase === "complete" : true) &&
    (authMode === "proxy" ? !!proxyUrl : true);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-end justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Provider Credentials</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage API keys and authentication for LLM providers</p>
        </div>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="gap-2 bg-primary/90 hover:bg-primary text-primary-foreground shadow-sm active:scale-95 transition-all"
        >
          <Plus className="h-4 w-4" /> Add Credential
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
            <div className="glass rounded-xl p-5 space-y-4">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">New Credential</p>

              <Input placeholder="Credential name" value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm bg-muted/50 border-border focus:border-primary/40 transition-colors" />

              <Select value={provider} onValueChange={(v) => v && handleProviderChange(v)}>
                <SelectTrigger className="h-9 text-sm bg-muted/50 border-border">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
                  {providerList?.map((p) => (
                    <SelectItem key={p.name} value={p.name} className="text-sm">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Auth mode selector for providers with multiple modes */}
              {provider && (PROVIDER_AUTH_MODES[provider]?.length ?? 0) > 1 && (
                <div className="flex gap-2">
                  {PROVIDER_AUTH_MODES[provider]?.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => { setAuthMode(mode); deviceAuth.reset(); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        authMode === mode
                          ? "bg-primary/15 text-primary border border-primary/25"
                          : "bg-muted/50 text-muted-foreground border border-border hover:bg-accent"
                      }`}
                    >
                      {mode === "device_auth" && <><Fingerprint className="h-3 w-3" /> Device Auth</>}
                      {mode === "proxy" && <><Server className="h-3 w-3" /> Copilot Proxy</>}
                      {mode === "api_key" && <><Key className="h-3 w-3" /> API Key</>}
                    </button>
                  ))}
                </div>
              )}

              {/* API Key input */}
              {authMode === "api_key" && (
                <Input
                  type="password"
                  placeholder="API Key (optional)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-9 text-sm font-mono bg-muted/50 border-border focus:border-primary/40 transition-colors"
                  autoComplete="off"
                />
              )}

              {/* Proxy URL input */}
              {authMode === "proxy" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium">Copilot Proxy</label>
                    <button
                      onClick={async () => {
                        setDetecting(true);
                        try {
                          const result = await copilotAuth.detectProxy();
                          if (result.found && result.base_url) {
                            setProxyUrl(result.base_url);
                            if (result.api_key) setProxyApiKey(result.api_key);
                            if (!name) setName("copilot-proxy");
                            toast.success("Detected copilot-proxy config from ~/.openclaw");
                          } else {
                            toast.error("No copilot-proxy config found in ~/.openclaw");
                          }
                        } catch {
                          toast.error("Failed to detect copilot-proxy config");
                        }
                        setDetecting(false);
                      }}
                      disabled={detecting}
                      className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                    >
                      {detecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                      Auto-detect from openclaw
                    </button>
                  </div>
                  <Input
                    placeholder="http://localhost:3000/api/v1"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    className="h-9 text-sm font-mono bg-muted/50 border-border focus:border-primary/40 transition-colors"
                  />
                  <Input
                    type="password"
                    placeholder="API Key / GitHub token (ghu_...)"
                    value={proxyApiKey}
                    onChange={(e) => setProxyApiKey(e.target.value)}
                    className="h-9 text-sm font-mono bg-muted/50 border-border focus:border-primary/40 transition-colors"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Requires the <span className="font-mono text-muted-foreground">copilot-proxy</span> VS Code extension running locally
                  </p>
                </div>
              )}

              {/* Device Auth flow */}
              {authMode === "device_auth" && (
                <div className="space-y-3">
                  {deviceAuth.state.phase === "idle" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={deviceAuth.start}
                      className="gap-2 border-border hover:border-primary/40"
                    >
                      <Fingerprint className="h-3.5 w-3.5" /> Start Device Authorization
                    </Button>
                  )}

                  {deviceAuth.state.phase === "waiting" && (
                    <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span>Waiting for authorization…</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">Your code:</span>
                        <code className="text-lg font-mono font-bold text-foreground tracking-[0.3em] bg-muted px-3 py-1.5 rounded-md border border-border">
                          {deviceAuth.state.userCode}
                        </code>
                        <button
                          onClick={() => copyCode(deviceAuth.state.phase === "waiting" ? deviceAuth.state.userCode : "")}
                          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                          title="Copy code"
                        >
                          {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <a
                        href={deviceAuth.state.verificationUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open {deviceAuth.state.verificationUri}
                      </a>
                    </div>
                  )}

                  {deviceAuth.state.phase === "complete" && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>Authenticated successfully — save to store token</span>
                    </div>
                  )}

                  {deviceAuth.state.phase === "error" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-red-400">
                        <XCircle className="h-3.5 w-3.5" />
                        <span>{deviceAuth.state.message}</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={deviceAuth.start} className="text-xs">
                        Try again
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* No auth needed */}
              {authMode === "none" && (
                <p className="text-xs text-muted-foreground italic">No authentication required — connects to local instance</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleCreate} disabled={!canSave || createCred.isPending} className="active:scale-95 transition-transform">
                  {createCred.isPending ? "Creating..." : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); deviceAuth.reset(); }} className="text-muted-foreground">Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider Sections */}
      <div className="space-y-5">
        {providerList?.map((prov, i) => {
          const provCreds = grouped.get(prov.name) ?? [];
          const colorClass = PROVIDER_COLORS[prov.name] ?? "text-primary";
          return (
            <motion.div
              key={prov.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              className="glass rounded-xl overflow-hidden"
            >
              {/* Provider header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-3">
                  <Shield className={`h-4 w-4 ${colorClass}`} />
                  <span className="text-sm font-semibold">{prov.name}</span>
                  {PROVIDER_DESCRIPTIONS[prov.name] && (
                    <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">{PROVIDER_DESCRIPTIONS[prov.name]}</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {provCreds.length} credential{provCreds.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Credential list */}
              <div className="p-3 space-y-1.5">
                {provCreds.length === 0 && (
                  <p className="text-xs text-muted-foreground italic px-2 py-3 text-center">No credentials configured</p>
                )}
                {provCreds.map((c) => {
                  const vs = validationState[c.id] ?? "idle";
                  const isEditing = editId === c.id;
                  return (
                    <div key={c.id} className="rounded-lg bg-muted/50 hover:bg-accent transition-colors">
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        {c.auth_type === "oauth" ? (
                          <Fingerprint className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : c.auth_type === "proxy" ? (
                          <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{c.auth_type} · {formatDistanceToNow(c.created_at)}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
                          c.is_active
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20"
                        }`}>
                          <span className={`h-1 w-1 rounded-full ${c.is_active ? "bg-emerald-400" : "bg-zinc-500"}`} />
                          {c.is_active ? "active" : "disabled"}
                        </span>
                        {vs === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        {vs === "valid" && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                        {vs === "invalid" && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                        <button
                          onClick={() => handleValidate(c.id)}
                          className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors"
                        >
                          Test
                        </button>
                        <button
                          onClick={() => isEditing ? setEditId(null) : startEdit(c)}
                          className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(c.id)}
                          className="text-muted-foreground hover:text-red-400 p-1 rounded-md hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Inline edit form */}
                      <AnimatePresence>
                        {isEditing && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3 pt-1 space-y-3 border-t border-border/50">
                              <Input
                                placeholder="Credential name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="h-8 text-xs bg-background border-border"
                              />
                              {c.auth_type === "proxy" ? (
                                <>
                                  <Input
                                    placeholder="Proxy URL"
                                    value={editProxyUrl}
                                    onChange={(e) => setEditProxyUrl(e.target.value)}
                                    className="h-8 text-xs font-mono bg-background border-border"
                                  />
                                  <Input
                                    type="password"
                                    placeholder={c.credential_hints?.api_key ? `Current: ${c.credential_hints.api_key}` : "API Key"}
                                    value={editProxyApiKey}
                                    onChange={(e) => setEditProxyApiKey(e.target.value)}
                                    className="h-8 text-xs font-mono bg-background border-border"
                                    autoComplete="off"
                                  />
                                </>
                              ) : c.auth_type !== "none" && c.auth_type !== "oauth" && c.auth_type !== "device_auth" && (
                                <Input
                                  type="password"
                                  placeholder={c.credential_hints?.api_key ? `Current: ${c.credential_hints.api_key}` : "API Key"}
                                  value={editApiKey}
                                  onChange={(e) => setEditApiKey(e.target.value)}
                                  className="h-8 text-xs font-mono bg-background border-border"
                                  autoComplete="off"
                                />
                              )}
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 text-xs active:scale-95 transition-transform" disabled={updateCred.isPending} onClick={() => handleUpdate(c.id, c.auth_type)}>
                                  {updateCred.isPending ? "Saving..." : "Save"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setEditId(null)}>Cancel</Button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>

      {deleteId && (
        <ConfirmDialog
          open
          title="Delete Credential"
          description="This credential will be permanently deleted."
          variant="destructive"
          confirmLabel="Delete"
          onClose={() => setDeleteId(null)}
          onConfirm={() => { deleteCred.mutate(deleteId); setDeleteId(null); }}
        />
      )}
    </div>
  );
}
