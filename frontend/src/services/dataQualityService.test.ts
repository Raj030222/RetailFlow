import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./jobsService", () => ({
  getJobLogs: vi.fn(),
  listJobs: vi.fn(),
}));

import { getJobLogs, listJobs } from "./jobsService";
import {
  fetchValidationJobs,
  fetchValidationOutput,
} from "./dataQualityService";
import type { JobRecord } from "../types/jobs";

function job(jobId: string, type: JobRecord["job_type"]): JobRecord {
  return {
    job_id: jobId,
    job_type: type,
    status: "succeeded",
    created_at: "2026-11-14T01:00:00Z",
    started_at: "2026-11-14T01:00:01Z",
    completed_at: "2026-11-14T01:00:02Z",
    exit_code: 0,
    error_summary: null,
    report_references: {},
  };
}

describe("dataQualityService", () => {
  beforeEach(() => {
    vi.mocked(listJobs).mockReset();
    vi.mocked(getJobLogs).mockReset();
  });

  it("filters persisted job pages to validation jobs without changing the API offset", async () => {
    vi.mocked(listJobs).mockResolvedValue([
      job("a".repeat(32), "validate"),
      job("b".repeat(32), "baseline"),
    ]);

    await expect(fetchValidationJobs(50)).resolves.toEqual({
      jobs: [job("a".repeat(32), "validate")],
      scanned: 2,
      hasMore: false,
    });
    expect(listJobs).toHaveBeenCalledWith(50, 50, undefined);
  });

  it("loads bounded job logs and parses the validation stdout", async () => {
    const validationJob = job("c".repeat(32), "validate");
    vi.mocked(getJobLogs).mockResolvedValue({
      job_id: validationJob.job_id,
      stdout: '{"status":"PASS","input_records":0}',
      stderr: "validation started",
      truncated: false,
    });

    await expect(fetchValidationOutput(validationJob)).resolves.toMatchObject({
      state: "ready",
      report: { status: "PASS", input_records: 0 },
      stderr: "validation started",
    });
    expect(getJobLogs).toHaveBeenCalledWith(validationJob.job_id, undefined);
  });

  it("surfaces API log errors to the caller", async () => {
    vi.mocked(getJobLogs).mockRejectedValue(new Error("offline"));
    await expect(fetchValidationOutput(job("d".repeat(32), "validate")))
      .rejects.toThrow("offline");
  });
});
