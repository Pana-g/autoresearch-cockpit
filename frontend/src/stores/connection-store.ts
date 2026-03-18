import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ServerConnection {
  id: string;
  label: string;
  url: string;       // e.g. "http://192.168.1.50:8000/api"
}

interface ConnectionState {
  /** All saved server connections */
  servers: ServerConnection[];
  /** Currently active server ID */
  activeServerId: string;
  /** Whether the user has completed the initial setup */
  setupCompleted: boolean;

  addServer: (server: Omit<ServerConnection, "id">) => string;
  updateServer: (id: string, patch: Partial<Omit<ServerConnection, "id">>) => void;
  removeServer: (id: string) => void;
  setActive: (id: string) => void;
  completeSetup: () => void;

  /** Convenience getters (derived) */
  getActive: () => ServerConnection;
}

const FALLBACK_SERVER: ServerConnection = {
  id: "local",
  label: "Local",
  url: "http://localhost:8000/api",
};

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      servers: [],
      activeServerId: "",
      setupCompleted: false,

      addServer: (server) => {
        const id = Math.random().toString(36).slice(2, 10);
        const newServer = { ...server, id };
        set((s) => ({
          servers: [...s.servers, newServer],
          activeServerId: s.activeServerId || id,
        }));
        return id;
      },

      updateServer: (id, patch) => {
        set((s) => ({
          servers: s.servers.map((srv) => (srv.id === id ? { ...srv, ...patch } : srv)),
        }));
      },

      removeServer: (id) => {
        set((s) => {
          const remaining = s.servers.filter((srv) => srv.id !== id);
          return {
            servers: remaining,
            activeServerId: s.activeServerId === id ? (remaining[0]?.id ?? "") : s.activeServerId,
          };
        });
      },

      setActive: (id) => set({ activeServerId: id }),

      completeSetup: () => set({ setupCompleted: true }),

      getActive: () => {
        const state = get();
        return state.servers.find((s) => s.id === state.activeServerId) ?? state.servers[0] ?? FALLBACK_SERVER;
      },
    }),
    {
      name: "autoresearch-connections",
    },
  ),
);
