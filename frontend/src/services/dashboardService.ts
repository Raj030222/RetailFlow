import { isPipelineJob, listJobs, getJobLogs } from "./jobsService";
import { getBenchmarkReports, getRunReports } from "./reportsService";
import type {
  BenchmarkReport,
  BenchmarkReportsResponse,
  JobRecord,
  ReconciliationReport,
  RunReportsResponse,
  ValidationFailureReport,
  ValidationReport,
} from "../types/jobs";
import type {
  BenchmarkWidgetData,
  JobWidgetData,
  QualityWidgetData,
  ValidationLogParseResult,
} from "../types/dashboard";

export const DASHBOARD_JOB_LIMIT = 100;

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isValidationReport(value: unknown): value is ValidationReport {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Record<string, unknown>;
  return (
    (report.status === "PASS" || report.status === "FAIL") &&
    isNonNegativeInteger(report.input_records) &&
    isNonNegativeInteger(report.valid_records) &&
    isNonNegativeInteger(report.rejected_records) &&
    isNonNegativeInteger(report.duplicate_records) &&
    isNonNegativeInteger(report.malformed_records)
  );
}

function isReconciliationReport(
  value: unknown,
): value is ReconciliationReport & Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Record<string, unknown>;
  return report.status === "PASS" || report.status === "FAIL";
}

function isImplementation(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.median_seconds === "number" &&
    Number.isFinite(result.median_seconds) &&
    result.median_seconds >= 0 &&
    typeof result.output_records === "number" &&
    Number.isInteger(result.output_records) &&
    result.output_records >= 0 &&
    typeof result.output_counts === "object" &&
    result.output_counts !== null &&
    typeof result.plan === "string"
  );
}

export function parseBenchmarkReport(
  value: unknown,
): BenchmarkReport | null {
  if (typeof value !== "object" || value === null) return null;
  const report = value as Record<string, unknown>;
  if (
    !isImplementation(report.baseline) ||
    !isImplementation(report.optimized) ||
    typeof report.equivalent !== "boolean" ||
    !isNonNegativeInteger(report.records) ||
    !isNonNegativeInteger(report.repetitions) ||
    !(
      report.improvement_percent === null ||
      (typeof report.improvement_percent === "number" &&
        Number.isFinite(report.improvement_percent))
    ) ||
    typeof report.performance_assessment !== "string"
  ) {
    return null;
  }
  return value as BenchmarkReport;
}

export function parseValidationLog(stdout: string): ValidationLogParseResult {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) return { report: null, invalid: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return { report: null, invalid: true };
  }
  if (isValidationReport(parsed)) return { report: parsed, invalid: false };
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "status" in parsed &&
    parsed.status === "FAIL" &&
    "error" in parsed &&
    typeof parsed.error === "string"
  ) {
    const report: ValidationFailureReport = {
      status: "FAIL",
      error: parsed.error,
    };
    return { report, invalid: false };
  }
  return { report: null, invalid: true };
}

function latestJob(
  jobs: JobRecord[],
  predicate: (job: JobRecord) => boolean,
): JobRecord | undefined {
  return jobs
    .filter(predicate)
    .sort(
      (left, right) =>
        Date.parse(right.created_at) - Date.parse(left.created_at),
    )[0];
}

function firstReportReference(job: JobRecord): {
  batchId: string;
  mode?: "baseline" | "optimized";
} | null {
  for (const [mode, references] of Object.entries(job.report_references)) {
    const reference = references.find((item) => item.endsWith(":reconciliation"));
    const batchId = reference?.slice(0, -":reconciliation".length);
    if (!batchId) continue;
    return {
      batchId,
      mode:
        job.job_type === "both"
          ? undefined
          : mode === "baseline" || mode === "optimized"
            ? mode
            : undefined,
    };
  }
  return null;
}

export async function loadJobsWidget(
  signal: AbortSignal,
): Promise<JobWidgetData> {
  const jobs = await listJobs(DASHBOARD_JOB_LIMIT, 0, signal);
  return {
    status: jobs.length > 0 ? "ready" : "empty",
    jobs,
    message:
      jobs.length === DASHBOARD_JOB_LIMIT
        ? "Showing the latest 100 persisted jobs. The API does not expose a total job count."
        : undefined,
  };
}

export async function loadBenchmarkWidget(
  signal: AbortSignal,
): Promise<BenchmarkWidgetData> {
  let response: BenchmarkReportsResponse;
  try {
    response = await getBenchmarkReports(signal);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 404
    ) {
      return { status: "empty", report: null };
    }
    throw error;
  }
  if (response.json === null) return { status: "empty", report: null };
  const report = parseBenchmarkReport(response.json);
  if (!report) {
    return {
      status: "error",
      report: null,
      message: "The benchmark report is present but has an unexpected structure.",
    };
  }
  return { status: "ready", report };
}

export async function loadQualityWidget(
  jobs: JobRecord[],
  signal: AbortSignal,
): Promise<QualityWidgetData> {
  const validationJob = latestJob(jobs, (job) => job.job_type === "validate");
  if (validationJob) {
    if (validationJob.status === "queued" || validationJob.status === "running") {
      return {
        status: "empty",
        source: null,
        report: null,
        message: "The latest validation job is still in progress.",
      };
    }
    try {
      const logs = await getJobLogs(validationJob.job_id, signal);
      const parsed = parseValidationLog(logs.stdout);
      if (parsed.report) {
        return { status: "ready", source: "validation", report: parsed.report };
      }
      return {
        status: "error",
        source: null,
        report: null,
        message: "The latest validation output is malformed or unavailable.",
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return {
        status: "error",
        source: null,
        report: null,
        message: "The latest validation job logs are unavailable.",
      };
    }
  }

  const pipelineJob = latestJob(
    jobs,
    (job) => isPipelineJob(job) && job.status !== "queued" && job.status !== "running",
  );
  const reference = pipelineJob ? firstReportReference(pipelineJob) : null;
  if (!reference) {
    return {
      status: "empty",
      source: null,
      report: null,
      message: "No validation report available.",
    };
  }
  try {
    const reports: RunReportsResponse = await getRunReports(
      reference.batchId,
      reference.mode,
      signal,
    );
    const reportEntries = Object.entries(reports.reports);
    const preferred = reportEntries.find(
      ([mode]) => mode === (reference.mode ?? "optimized"),
    );
    const report = (preferred ? [preferred[1]] : reportEntries.map(([, value]) => value))
      .map((entry) => entry.reconciliation)
      .filter(
        (value): value is ReconciliationReport & Record<string, unknown> =>
          value !== null && isReconciliationReport(value),
      )[0];
    if (!report) {
      return {
        status: "empty",
        source: null,
        report: null,
        message: "No validation report available.",
      };
    }
    return { status: "ready", source: "reconciliation", report };
  } catch (error) {
    if (signal.aborted) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 404
    ) {
      return {
        status: "empty",
        source: null,
        report: null,
        message: "No validation report available.",
      };
    }
    return {
      status: "error",
      source: null,
      report: null,
      message: "The latest reconciliation report could not be loaded.",
    };
  }
}

export function hasActiveJobs(jobs: JobRecord[]): boolean {
  return jobs.some((job) => job.status === "queued" || job.status === "running");
}
