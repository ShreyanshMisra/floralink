"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  reportDraftStore,
  useReportDraftStore,
} from "@/features/reports/report-draft-store";
import { registerFloraLinkTools } from "@/features/webmcp/register-floralink-tools";

export type WebMcpStatus = "unsupported" | "registering" | "ready" | "error";

const WebMcpStatusContext = createContext<WebMcpStatus>("registering");

export function WebMcpProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useReportDraftStore((state) => state.hydrated);
  const [status, setStatus] = useState<WebMcpStatus>("registering");

  useEffect(() => {
    if (!reportDraftStore.persist.hasHydrated()) {
      void reportDraftStore.persist.rehydrate();
    } else {
      reportDraftStore.getState().markHydrated();
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!document.modelContext) {
      let disposed = false;
      queueMicrotask(() => {
        if (!disposed) setStatus("unsupported");
      });
      return () => {
        disposed = true;
      };
    }

    const controller = new AbortController();
    void registerFloraLinkTools({
      modelContext: document.modelContext,
      signal: controller.signal,
    })
      .then(() => {
        if (!controller.signal.aborted) setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });

    return () => controller.abort();
  }, [hydrated]);

  const value = useMemo(() => status, [status]);
  return (
    <WebMcpStatusContext.Provider value={value}>
      {children}
    </WebMcpStatusContext.Provider>
  );
}

export function useWebMcpStatus() {
  return useContext(WebMcpStatusContext);
}
