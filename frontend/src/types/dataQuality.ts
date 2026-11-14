import type { JobRecord, JobLogsResponse } from "./jobs";

export type DatasetName = "customers" | "products" | "transactions";
export type ValidationResultStatus = "PASS" | "FAIL";
export type ValidationQualityStatus =
  | ValidationResultStatus
  | "RUNNING"
  | "LOADING"
  | "ERROR"
  | "NO DATA";
export type ValidationOutputState =
  | "pending"
  | "loading"
  | "ready"
  | "empty"
  | "invalid"
  | "error";

export interface DataQualityReport {
  status: ValidationResultStatus;
  input_records?: number;
  valid_records?: number;
  rejected_records?: number;
  rejection_reason_counts?: Record<string, number>;
  duplicate_records?: number;
  malformed_records?: number;
  malformed_records_by_dataset?: Partial<Record<DatasetName, number>>;
  duplicate_dimension_keys?: Partial<Record<"customers" | "products", number>>;
  missing_dimension_keys?: Partial<Record<"customers" | "products", number>>;
  reconciled?: boolean;
  error?: string;
}

export interface ValidationOutput extends JobLogsResponse {
  state: ValidationOutputState;
  report: DataQualityReport | null;
  message?: string;
}

export type IntegrityCheckStatus = "passed" | "failed" | "unavailable";

export interface IntegrityCheck {
  id: string;
  label: string;
  status: IntegrityCheckStatus;
  detail: string;
}

export interface ValidationJobPage {
  jobs: JobRecord[];
  scanned: number;
  hasMore: boolean;
}
