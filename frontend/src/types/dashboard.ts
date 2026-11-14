import type {
  BenchmarkReport,
  JobRecord,
  ReconciliationReport,
  ValidationFailureReport,
  ValidationReport,
} from "./jobs";

export type WidgetLoadStatus = "loading" | "ready" | "empty" | "error";

export interface JobWidgetData {
  status: WidgetLoadStatus;
  jobs: JobRecord[];
  message?: string;
}

export interface BenchmarkWidgetData {
  status: WidgetLoadStatus;
  report: BenchmarkReport | null;
  message?: string;
}

export interface QualityWidgetData {
  status: WidgetLoadStatus;
  source: "validation" | "reconciliation" | null;
  report: ValidationReport | ReconciliationReport | ValidationFailureReport | null;
  message?: string;
}

export interface DashboardData {
  jobs: JobWidgetData;
  benchmark: BenchmarkWidgetData;
  quality: QualityWidgetData;
  lastUpdated: Date | null;
  refreshing: boolean;
}

export interface PipelineKpis {
  total: number;
  succeeded: number;
  failed: number;
  queued: number;
  running: number;
  latestDurationSeconds: number | null;
  limited: boolean;
}

export interface ValidationLogParseResult {
  report: ValidationReport | ValidationFailureReport | null;
  invalid: boolean;
}
