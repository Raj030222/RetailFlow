export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type JobType =
  | "generate"
  | "validate"
  | "baseline"
  | "optimized"
  | "both"
  | "benchmark";

export interface JobRecord {
  job_id: string;
  job_type: JobType;
  status: JobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  error_summary: string | null;
  report_references: Record<string, string[]>;
}

export interface JobListResponse {
  jobs: JobRecord[];
}

export interface JobSubmission {
  job_id: string;
  job_type: JobType;
  status: JobStatus;
  created_at: string;
}

export interface JobLogsResponse {
  job_id: string;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export interface RunReportsResponse {
  batch_id: string;
  reports: Record<
    string,
    {
      metrics: Record<string, unknown> | null;
      reconciliation: Record<string, unknown> | null;
    }
  >;
}

export interface ValidationReport {
  status: "PASS" | "FAIL";
  input_records: number;
  valid_records: number;
  rejected_records: number;
  duplicate_records: number;
  malformed_records: number;
  malformed_records_by_dataset?: Record<string, number>;
  duplicate_dimension_keys?: Record<string, number>;
  missing_dimension_keys?: Record<string, number>;
  reconciled?: boolean;
}

export interface ValidationFailureReport {
  status: "FAIL";
  error: string;
}

export interface ReconciliationReport {
  status: "PASS" | "FAIL";
  input_records?: number;
  valid_records?: number;
  rejected_records?: number;
  duplicate_records?: number;
  output_records?: number;
  primary_key_unique?: boolean;
  referential_integrity?: boolean;
  total_revenue?: string;
  total_units_sold?: number;
  mode?: string;
}

export interface BenchmarkImplementation {
  median_seconds: number;
  output_records: number;
  output_counts: Record<string, number>;
  plan: string;
}

export interface BenchmarkReport {
  baseline: BenchmarkImplementation;
  optimized: BenchmarkImplementation;
  equivalent: boolean;
  records: number;
  repetitions: number;
  improvement_percent: number | null;
  performance_assessment: string;
  performance_note: string;
}

export interface BenchmarkReportsResponse {
  json: BenchmarkReport | null;
  csv: string | null;
  markdown: string | null;
}
