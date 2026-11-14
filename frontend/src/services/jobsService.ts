import { apiGet, apiPost } from "./apiClient";
import type {
  JobLogsResponse,
  JobRecord,
  JobSubmission,
  JobType,
} from "../types/jobs";

const jobTypes: JobType[] = [
  "generate",
  "validate",
  "baseline",
  "optimized",
  "both",
  "benchmark",
];
const jobStatuses = ["queued", "running", "succeeded", "failed", "cancelled"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJobRecord(value: unknown): value is JobRecord {
  if (!isObject(value)) return false;
  const record = value;
  const references = record.report_references;
  return (
    typeof record.job_id === "string" &&
    typeof record.job_type === "string" &&
    jobTypes.includes(record.job_type as JobType) &&
    typeof record.status === "string" &&
    jobStatuses.includes(record.status) &&
    typeof record.created_at === "string" &&
    (record.started_at === null || typeof record.started_at === "string") &&
    (record.completed_at === null || typeof record.completed_at === "string") &&
    (record.exit_code === null || typeof record.exit_code === "number") &&
    (record.error_summary === null || typeof record.error_summary === "string") &&
    isObject(references) &&
    Object.values(references).every(
      (items) => Array.isArray(items) && items.every((item) => typeof item === "string"),
    )
  );
}

function isJobSubmission(value: unknown): value is JobSubmission {
  if (!isObject(value)) return false;
  const record = value;
  return (
    typeof record.job_id === "string" &&
    typeof record.job_type === "string" &&
    jobTypes.includes(record.job_type as JobType) &&
    typeof record.status === "string" &&
    jobStatuses.includes(record.status) &&
    typeof record.created_at === "string"
  );
}

function parseSubmission(value: unknown): JobSubmission {
  if (!isJobSubmission(value)) {
    throw new Error("The job submission response has an unexpected shape");
  }
  return value;
}

function parseJobRecord(value: unknown): JobRecord {
  if (!isJobRecord(value)) {
    throw new Error("The job response has an unexpected shape");
  }
  return value;
}

export interface GenerateJobRequest {
  records?: number;
  invalid_percent?: number;
  duplicate_events?: boolean;
}

export interface RunJobRequest {
  mode: "baseline" | "optimized" | "both";
  batch_id?: string;
}

export interface BenchmarkJobRequest {
  records?: number;
  repetitions?: number;
}

export type SubmitOnce = (
  fingerprint: string,
  operation: () => Promise<JobSubmission>,
) => Promise<JobSubmission | null>;

export async function listJobs(
  limit = 100,
  offset = 0,
  signal?: AbortSignal,
): Promise<JobRecord[]> {
  const response = await apiGet<unknown>(
    `/api/v1/jobs?limit=${limit}&offset=${offset}`,
    { signal },
  );
  if (
    !isObject(response) ||
    !Array.isArray(response.jobs) ||
    !response.jobs.every(isJobRecord)
  ) {
    throw new Error("The jobs response has an unexpected shape");
  }
  return response.jobs;
}

export async function getJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobRecord> {
  const value = await apiGet<unknown>(
    `/api/v1/jobs/${encodeURIComponent(jobId)}`,
    { signal },
  );
  const job = parseJobRecord(value);
  if (job.job_id !== jobId) {
    throw new Error("The job response does not match the requested job");
  }
  return job;
}

export function getJobLogs(
  jobId: string,
  signal?: AbortSignal,
): Promise<JobLogsResponse> {
  return apiGet<unknown>(
    `/api/v1/jobs/${encodeURIComponent(jobId)}/logs`,
    { signal },
  ).then((value) => {
    if (
      !isObject(value) ||
      typeof value.job_id !== "string" ||
      value.job_id !== jobId ||
      typeof value.stdout !== "string" ||
      typeof value.stderr !== "string" ||
      typeof value.truncated !== "boolean"
    ) {
      throw new Error("The job logs response has an unexpected shape");
    }
    return value as unknown as JobLogsResponse;
  });
}

export function submitGenerate(
  request: GenerateJobRequest,
): Promise<JobSubmission> {
  return apiPost<unknown, GenerateJobRequest>(
    "/api/v1/jobs/generate",
    request,
  ).then(parseSubmission);
}

export function submitValidation(): Promise<JobSubmission> {
  return apiPost<unknown, Record<string, never>>(
    "/api/v1/jobs/validate",
    {},
  ).then(parseSubmission);
}

export function submitRun(request: RunJobRequest): Promise<JobSubmission> {
  return apiPost<unknown, RunJobRequest>("/api/v1/jobs/run", request).then(
    parseSubmission,
  );
}

export function submitBenchmark(
  request: BenchmarkJobRequest,
): Promise<JobSubmission> {
  return apiPost<unknown, BenchmarkJobRequest>(
    "/api/v1/jobs/benchmark",
    request,
  ).then(parseSubmission);
}

export function isPipelineJob(job: JobRecord): boolean {
  return job.job_type === "baseline" ||
    job.job_type === "optimized" ||
    job.job_type === "both";
}

export function jobOperationLabel(jobType: JobType): string {
  const labels: Record<JobType, string> = {
    generate: "Generate data",
    validate: "Validate data",
    baseline: "Pipeline run",
    optimized: "Pipeline run",
    both: "Pipeline run",
    benchmark: "Benchmark",
  };
  return labels[jobType];
}
