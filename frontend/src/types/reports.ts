import type { JobRecord, JobStatus } from "./jobs";

export type ReportCategory =
  | "Pipeline Execution"
  | "Data Quality"
  | "Benchmark";

export type ReportAvailability = "available" | "unavailable" | "on-demand";
export type ReportFormat = "JSON" | "CSV" | "Markdown" | "Job logs" | "Not available";
export type ReportPreviewKind =
  | "json"
  | "csv"
  | "markdown"
  | "validation"
  | "unavailable";
export type ReportSourceKind =
  | "run-metrics"
  | "reconciliation"
  | "benchmark"
  | "validation-job";

export interface ReportCatalogEntry {
  id: string;
  name: string;
  category: ReportCategory;
  format: ReportFormat;
  previewKind: ReportPreviewKind;
  sourceKind: ReportSourceKind;
  fileName: string | null;
  available: ReportAvailability;
  content: unknown | null;
  generatedAt: string | null;
  batchId: string | null;
  runId: string | null;
  jobId: string | null;
  jobStatus: JobStatus | null;
  jobType: JobRecord["job_type"] | null;
  reportStatus: string | null;
  associationVerified: boolean;
  message: string | null;
}
