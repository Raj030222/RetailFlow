import { apiGet } from "./apiClient";
import type {
  BenchmarkReportsResponse,
  RunReportsResponse,
} from "../types/jobs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReportValue(value: unknown): boolean {
  return value === null || isObject(value);
}

export function getRunReports(
  batchId: string,
  mode?: "baseline" | "optimized",
  signal?: AbortSignal,
): Promise<RunReportsResponse> {
  const params = mode ? `?mode=${mode}` : "";
  return apiGet<unknown>(
    `/api/v1/reports/runs/${encodeURIComponent(batchId)}${params}`,
    { signal },
  ).then((value) => {
    if (
      !isObject(value) ||
      typeof value.batch_id !== "string" ||
      !isObject(value.reports)
    ) {
      throw new Error("The run report response has an unexpected shape");
    }
    for (const report of Object.values(value.reports)) {
      if (
        !isObject(report) ||
        !("metrics" in report) ||
        !("reconciliation" in report) ||
        !isReportValue(report.metrics) ||
        !isReportValue(report.reconciliation)
      ) {
        throw new Error("The run report response has an unexpected shape");
      }
    }
    return value as unknown as RunReportsResponse;
  });
}

export function getBenchmarkReports(
  signal?: AbortSignal,
): Promise<BenchmarkReportsResponse> {
  return apiGet<unknown>("/api/v1/reports/benchmark", {
    signal,
  }).then((value) => {
    if (
      !isObject(value) ||
      !("json" in value) ||
      !isReportValue(value.json) ||
      !("csv" in value) ||
      (value.csv !== null && typeof value.csv !== "string") ||
      !("markdown" in value) ||
      (value.markdown !== null && typeof value.markdown !== "string")
    ) {
      throw new Error("The benchmark report response has an unexpected shape");
    }
    return value as unknown as BenchmarkReportsResponse;
  });
}
