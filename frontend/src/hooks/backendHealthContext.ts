import { createContext, useContext } from "react";
import type { BackendConnectionState } from "../types/api";

export const BackendHealthContext =
  createContext<BackendConnectionState | null>(null);

export function useBackendHealth(): BackendConnectionState {
  const state = useContext(BackendHealthContext);
  if (!state) {
    throw new Error("useBackendHealth must be used within BackendHealthProvider");
  }
  return state;
}
