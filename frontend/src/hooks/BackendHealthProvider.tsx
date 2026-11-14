import { useEffect, useState, type ReactNode } from "react";
import { checkBackendHealth } from "../services/healthService";
import type { BackendConnectionState } from "../types/api";
import { BackendHealthContext } from "./backendHealthContext";

const HEALTH_POLL_INTERVAL_MS = 30_000;

export function BackendHealthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackendConnectionState>("checking");

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | undefined;

    const check = async () => {
      controller = new AbortController();
      try {
        await checkBackendHealth(controller.signal);
        if (active) setState("connected");
      } catch {
        if (active && !controller.signal.aborted) setState("disconnected");
      } finally {
        if (active) timer = window.setTimeout(check, HEALTH_POLL_INTERVAL_MS);
      }
    };

    void check();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, []);

  return (
    <BackendHealthContext.Provider value={state}>
      {children}
    </BackendHealthContext.Provider>
  );
}
