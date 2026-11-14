import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./apiClient";

vi.mock("./jobsService", () => ({
  getJobLogs: vi.fn(),
  isPipelineJob: (job: { job_type: string }) =>
    ["baseline", "optimized", "both"].includes(job.job_type),
  listJobs: vi.fn(),
}));

vi.mock("./reportsService", () => ({
  getBenchmarkReports: vi.fn(),
  getRunReports: vi.fn(),
}));

import { getJobLogs, listJobs } from "./jobsService";
import { getBenchmarkReports, getRunReports } from "./reportsService";
import {
  loadBenchmarkWidget,
  loadJobsWidget,
  loadQualityWidget,
  parseBenchmarkReport,
  parseValidationLog,
} from "./dashboardService";
import type { JobRecord } from "../types/jobs";

const signal = new AbortController().signal;

function job(
  jobId: string,
  jobType: JobRecord["job_type"],
  status: JobRecord["status"] = "succeeded",
): JobRecord {
  return {
    job_id: jobId,
    job_type: jobType,
    status,
    created_at: "2026-11-13T10:00:00Z",
    started_at: "2026-11-13T10:00:01Z",
    completed_at: "2026-11-13T10:00:02Z",
    exit_code: 0,
    error_summary: null,
    report_references:
      jobType === "baseline"
        ? { baseline: ["batch-1:metrics", "batch-1:reconciliation"] }
        : {},
  };
}

const benchmark = {
  baseline: {
    median_seconds: 4,
    output_records: 20,
    output_counts: { processed_transactions: 20 },
    plan: "baseline plan",
  },
  optimized: {
    median_seconds: 3,
    output_records: 20,
    output_counts: { processed_transactions: 20 },
    plan: "optimized plan",
  },
  equivalent: true,
  records: 20,
  repetitions: 1,
  improvement_percent: null,
  performance_assessment: "insufficient_repetitions",
  performance_note: "A single repetition is insufficient.",
};

beforeEach(() => {
  vi.mocked(listJobs).mockReset();
  vi.mocked(getJobLogs).mockReset();
  vi.mocked(getBenchmarkReports).mockReset();
  vi.mocked(getRunReports).mockReset();
});

describe("dashboard data services", () => {
  it("loads an empty job history without fabricating records", async () => {
    vi.mocked(listJobs).mockResolvedValue([]);

    await expect(loadJobsWidget(signal)).resolves.toMatchObject({
      status: "empty",
      jobs: [],
    });
  });

  it("surfaces API errors instead of inventing an empty result", async () => {
    vi.mocked(listJobs).mockRejectedValue(new ApiRequestError("offline"));

    await expect(loadJobsWidget(signal)).rejects.toThrow("offline");
  });

  it("treats a missing benchmark report as an empty state", async () => {
    vi.mocked(getBenchmarkReports).mockRejectedValue(
      new ApiRequestError("not found", 404),
    );

    await expect(loadBenchmarkWidget(signal)).resolves.toEqual({
      status: "empty",
      report: null,
    });
  });

  it("keeps a one-repetition benchmark inconclusive", () => {
    const parsed = parseBenchmarkReport(benchmark);
    expect(parsed?.performance_assessment).toBe("insufficient_repetitions");
    expect(parsed?.improvement_percent).toBeNull();
  });

  it("rejects malformed or unexpected report structures", () => {
    expect(parseBenchmarkReport({ ...benchmark, optimized: undefined })).toBeNull();
    expect(parseValidationLog("not json")).toEqual({ report: null, invalid: true });
    expect(parseValidationLog('{"status":"PASS"}')).toEqual({
      report: null,
      invalid: true,
    });
  });

  it("parses the actual missing-input validation failure response", () => {
    expect(
      parseValidationLog(JSON.stringify({ status: "FAIL", error: "Input file missing" })),
    ).toEqual({
      report: { status: "FAIL", error: "Input file missing" },
      invalid: false,
    });
  });

  it("does not show stale pipeline quality while the latest validation is running", async () => {
    const activeValidation = job("validation", "validate", "running");
    const result = await loadQualityWidget(
      [activeValidation, job("older-run", "baseline")],
      signal,
    );
    expect(result).toMatchObject({
      status: "empty",
      message: "The latest validation job is still in progress.",
    });
    expect(getJobLogs).not.toHaveBeenCalled();
    expect(getRunReports).not.toHaveBeenCalled();
  });

  it("uses the actual validation job output and reconciliation response", async () => {
    const validationReport = {
      status: "FAIL",
      input_records: 10,
      valid_records: 7,
      rejected_records: 2,
      duplicate_records: 1,
      malformed_records: 0,
    };
    vi.mocked(getJobLogs).mockResolvedValue({
      job_id: "validation",
      stdout: JSON.stringify(validationReport),
      stderr: "",
      truncated: false,
    });

    await expect(
      loadQualityWidget([job("validation", "validate", "failed")], signal),
    ).resolves.toMatchObject({
      status: "ready",
      source: "validation",
      report: validationReport,
    });

    vi.mocked(getRunReports).mockResolvedValue({
      batch_id: "batch-1",
      reports: {
        baseline: {
          metrics: null,
          reconciliation: {
            status: "PASS",
            input_records: 10,
            valid_records: 10,
            rejected_records: 0,
            duplicate_records: 0,
            output_records: 10,
          },
        },
      },
    });
    await expect(
      loadQualityWidget([job("run", "baseline")], signal),
    ).resolves.toMatchObject({
      status: "ready",
      source: "reconciliation",
      report: { status: "PASS", input_records: 10 },
    });
    expect(getRunReports).toHaveBeenCalledWith("batch-1", "baseline", signal);
  });
});
