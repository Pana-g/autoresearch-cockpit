import { useState } from "react";
import { Link } from "react-router-dom";
import { useConnectionStore, type ServerConnection } from "@/stores/connection-store";
import { checkConnection } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Server, ChevronDown, Check, Plus, Settings2, Radio, Loader2,
} from "lucide-react";


export function ServerSwitcher() {
  const { servers, activeServerId, addServer, setActive } = useConnectionStore();
  const activeServer = useConnectionStore((s) => s.getActive());
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-accent transition-all duration-150 group text-left cursor-pointer">
              <div className="h-7 w-7 rounded-md bg-primary/12 flex items-center justify-center shrink-0">
                <Server className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium leading-none">Server</p>
                <p className="text-xs font-medium truncate mt-0.5">{activeServer.label}</p>
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-muted-foreground transition-colors shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" sideOffset={4} className="w-56">
          <DropdownMenuGroup>
          <DropdownMenuLabel>Servers</DropdownMenuLabel>
          {servers.map((srv) => (
            <DropdownMenuItem
              key={srv.id}
              className="gap-2.5 py-1.5"
              onClick={() => setActive(srv.id)}
            >
              {srv.id === activeServerId ? (
                <Radio className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{srv.label}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{srv.url.replace(/\/api$/, "")}</p>
              </div>
              {srv.id === activeServerId && (
                <Check className="h-3 w-3 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">Add Server</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" render={<Link to="/settings/servers" />}>
            <Settings2 className="h-3.5 w-3.5" />
            <span className="text-xs">Manage Servers</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="glass border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Server Connection</DialogTitle>
          </DialogHeader>
          <QuickServerForm
            onSave={(data) => {
              addServer(data);
              setAddOpen(false);
            }}
            onCancel={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}


function QuickServerForm({
  onSave,
  onCancel,
}: {
  onSave: (data: Omit<ServerConnection, "id">) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("http://");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  const normalizedUrl = url.replace(/\/+$/, "");
  const baseUrl = normalizedUrl.endsWith("/api") ? normalizedUrl : `${normalizedUrl}/api`;

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

  return (
    <div className="space-y-4 pt-2">
      <div>
        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Label</Label>
        <Input
          className="mt-1.5 h-9 text-sm bg-muted/50 border-border"
          placeholder="My Remote Server"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Server URL</Label>
        <Input
          className="mt-1.5 h-9 text-sm font-mono bg-muted/50 border-border"
          placeholder="http://192.168.1.50:8000"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleTest} disabled={testing || !url}>
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Test
        </Button>
        {testResult === "ok" && <span className="text-[11px] text-emerald-400">Connected</span>}
        {testResult === "fail" && <span className="text-[11px] text-red-400">Unreachable</span>}
      </div>

      <div className="sep-gradient" />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-8 text-xs" disabled={!label.trim() || !url.trim()} onClick={() => onSave({ label: label.trim(), url: baseUrl })}>
          Save
        </Button>
      </div>
    </div>
  );
}
