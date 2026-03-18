import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import ProjectsPage from "@/pages/projects";
import ProjectDetailPage from "@/pages/project-detail";
import RunCockpitPage from "@/pages/run-cockpit";
import ProjectSettingsPage from "@/pages/project-settings";
import ProvidersPage from "@/pages/providers";
import ChannelsPage from "@/pages/channels";
import ServersPage from "@/pages/servers";
import SettingsPage from "@/pages/settings";
import { ErrorBoundary } from "@/components/error-boundary";
import { WelcomeSetup } from "@/components/welcome-setup";
import { useConnectionStore } from "@/stores/connection-store";
import { useEffect, useRef } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Clear all cached queries when the active server changes */
function ServerSwitchHandler() {
  const qc = useQueryClient();
  const activeServerId = useConnectionStore((s) => s.activeServerId);
  const prevServer = useRef(activeServerId);

  useEffect(() => {
    if (prevServer.current !== activeServerId) {
      prevServer.current = activeServerId;
      qc.clear();
    }
  }, [activeServerId, qc]);

  return null;
}

export default function App() {
  const setupCompleted = useConnectionStore((s) => s.setupCompleted);

  if (!setupCompleted) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WelcomeSetup />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <ServerSwitchHandler />
          <AppShell>
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/projects" replace />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
              <Route path="/projects/:projectId/runs/:runId" element={<RunCockpitPage />} />
              <Route path="/settings/providers" element={<ProvidersPage />} />
              <Route path="/settings/channels" element={<ChannelsPage />} />
              <Route path="/settings/servers" element={<ServersPage />} />
              <Route path="/settings/general" element={<SettingsPage />} />
            </Routes>
            </ErrorBoundary>
          </AppShell>
          <Toaster />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
