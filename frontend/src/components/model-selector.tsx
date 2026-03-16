import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProviders, useProviderModels, useCredentials, useRefreshModels } from "@/hooks/use-queries";
import { RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

interface Props {
  provider: string;
  model: string;
  credentialId?: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onCredentialChange?: (v: string) => void;
}

export function ModelSelector({ provider, model, credentialId, onProviderChange, onModelChange, onCredentialChange }: Props) {
  const { data: providerList } = useProviders();
  const { data: modelData, isFetching } = useProviderModels(provider, credentialId);
  const { data: credList } = useCredentials();
  const refreshModels = useRefreshModels();
  const [providerCreds, setProviderCreds] = useState<typeof credList>([]);

  const credentialName = credentialId && credList
    ? credList.find((c) => c.id === credentialId)?.name
    : undefined;

  useEffect(() => {
    if (credList && provider) {
      setProviderCreds(credList.filter((c) => c.provider === provider && c.is_active));
    }
  }, [credList, provider]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 block font-medium">Provider</label>
        <Select value={provider} onValueChange={(v) => v && onProviderChange(v)}>
          <SelectTrigger className="h-9 text-sm bg-tint/[3%] border-border/50">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {providerList?.map((p) => (
              <SelectItem key={p.name} value={p.name} className="text-sm">{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {onCredentialChange && providerCreds && providerCreds.length > 0 && (
        <div>
          <label className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 block font-medium">Credential</label>
          <Select value={credentialId ?? ""} onValueChange={(v) => v && onCredentialChange(v)}>
            <SelectTrigger className="h-9 text-sm bg-tint/[3%] border-border/50">
              <SelectValue placeholder="Select credential">{credentialName ?? "Select credential"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {providerCreds.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium">Model</label>
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground/50 hover:text-foreground"
                disabled={!provider || refreshModels.isPending || isFetching}
                onClick={() => refreshModels.mutate({ provider, credentialId })}
              >
                <RefreshCw className={`h-3 w-3 ${refreshModels.isPending || isFetching ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs">
                Refresh models
                {modelData?.cached_at_age != null && (
                  <span className="text-muted-foreground ml-1">
                    (cached {formatCacheAge(modelData.cached_at_age)})
                  </span>
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <Select value={model} onValueChange={(v) => v && onModelChange(v)}>
          <SelectTrigger className="h-9 text-sm bg-tint/[3%] border-border/50 font-mono truncate">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent className="min-w-[320px]">
            <SelectGroup>
              <SelectLabel className="text-[11px]">{provider || "Models"}</SelectLabel>
              {[...new Set(modelData?.models)].map((m) => (
                <SelectItem key={m} value={m} className="text-sm font-mono">{m}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function formatCacheAge(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
