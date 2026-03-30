import React from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Beaker, KeyRound, FolderOpen, Menu, ChevronRight, Sun, Moon, Monitor, Bell, Settings, FileJson2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useThemeStore } from "@/stores/theme-store";
import { useConnectionStore } from "@/stores/connection-store";
import { ServerSwitcher } from "@/components/server-switcher";
import { motion, AnimatePresence } from "motion/react";import { version } from "../../package.json";
const NAV = [
  { to: "/projects", label: "Projects", icon: FolderOpen },
  { to: "/settings/providers", label: "Providers", icon: KeyRound },
  { to: "/settings/channels", label: "Channels", icon: Bell },
  { to: "/settings/general", label: "Settings", icon: Settings },
];

function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const crumbs: { label: string; to: string }[] = [];
  if (segments[0] === "projects") {
    crumbs.push({ label: "Projects", to: "/projects" });
    if (segments[1]) crumbs.push({ label: segments[1].slice(0, 8), to: `/projects/${segments[1]}` });
    if (segments[2] === "runs" && segments[3]) crumbs.push({ label: `Run ${segments[3].slice(0, 8)}`, to: location.pathname });
    if (segments[2] === "settings") crumbs.push({ label: "Settings", to: location.pathname });
  } else if (segments[0] === "settings") {
    if (segments[1] === "providers") crumbs.push({ label: "Providers", to: "/settings/providers" });
    else if (segments[1] === "channels") crumbs.push({ label: "Channels", to: "/settings/channels" });
    else if (segments[1] === "servers") crumbs.push({ label: "Servers", to: "/settings/servers" });
    else if (segments[1] === "general") crumbs.push({ label: "Settings", to: "/settings/general" });
    else crumbs.push({ label: "Settings", to: "/settings/providers" });
  }
  if (crumbs.length === 0) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {crumbs.map((c, i) => (
        <span key={c.to} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 opacity-40" />}
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-mono">{c.label}</span>
          ) : (
            <Link to={c.to} className="hover:text-foreground transition-colors font-mono">{c.label}</Link>
          )}
        </span>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { theme, setTheme } = useThemeStore();
  const activeServer = useConnectionStore((s) => s.getActive());
  const location = useLocation();

  // Close sidebar on route change on mobile
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const prevPath = React.useRef(location.pathname);
  React.useEffect(() => {
    if (prevPath.current !== location.pathname && isMobile && sidebarOpen) {
      toggleSidebar();
    }
    prevPath.current = location.pathname;
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* Mobile overlay backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={toggleSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex-shrink-0 border-r border-border flex flex-col overflow-hidden fixed md:relative inset-y-0 left-0 z-50 md:z-auto"
            style={{ background: "var(--sidebar)" }}
          >
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-5">
              <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <Beaker className="h-4 w-4 text-primary" />
              </div>
              <div>
                <span className="font-semibold text-sm tracking-tight block leading-none">AutoResearch</span>
                <span className="text-[10px] text-muted-foreground font-mono">cockpit</span>
              </div>
            </div>

            <div className="sep-gradient mx-4" />

            {/* Server Switcher */}
            <div className="px-3 py-3">
              <ServerSwitcher />
            </div>

            <div className="sep-gradient mx-4" />

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV.map((item) => {
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                      active
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="sep-gradient mx-4" />

            {activeServer?.url && (
              <div className="px-3 py-2">
                <a
                  href={`${activeServer.url.replace(/\/api\/?$/, '')}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150"
                >
                  <FileJson2 className="h-4 w-4" />
                  API Docs
                </a>
              </div>
            )}

            <div className="sep-gradient mx-4" />

            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground font-mono tracking-wide">v{version}</p>
              <div className="flex gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/60 animate-pulse-dot" />
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center h-12 px-4 border-b border-border shrink-0 bg-background gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-accent transition-colors"
            onClick={toggleSidebar}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Breadcrumbs />
          <div className="flex-1" />
          <div className="flex items-center gap-2.5">
            <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
              {([
                { value: "light" as const, icon: Sun, label: "Light" },
                { value: "system" as const, icon: Monitor, label: "System" },
                { value: "dark" as const, icon: Moon, label: "Dark" },
              ]).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  title={label}
                  className={`h-6 w-6 rounded-md flex items-center justify-center transition-all duration-150 ${
                    theme === value
                      ? "bg-primary/15 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                </button>
              ))}
            </div>
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
            <span className="text-[10px] text-muted-foreground font-mono tracking-wide hidden sm:inline">
              {activeServer.label}
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
