import { apiGet } from "./apiClient";
import type { HealthResponse } from "../types/api";

export async function checkBackendHealth(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const result = await apiGet<HealthResponse>("/api/v1/health", { signal });
  if (result.status !== "ok") {
    throw new Error("RetailFlow API returned an unexpected health response");
  }
  return result;
}
