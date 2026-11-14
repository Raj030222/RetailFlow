import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./apiClient", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

import { apiGet, apiPost } from "./apiClient";
import {
  getJob,
  getJobLogs,
  listJobs,
  submitBenchmark,
  submitGenerate,
  submitRun,
  submitValidation,
} from "./jobsService";

describe("jobsService", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
  });

  it("uses the existing job listing endpoint and rejects unexpected payload shapes", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ jobs: [] });
    await expect(listJobs(100, 0)).resolves.toEqual([]);
    expect(apiGet).toHaveBeenCalledWith("/api/v1/jobs?limit=100&offset=0", {
      signal: undefined,
    });

    vi.mocked(apiGet).mockResolvedValueOnce({ jobs: [{ status: "unknown" }] });
    await expect(listJobs()).rejects.toThrow("unexpected shape");
  });

  it("uses the actual supported submission endpoints and request bodies", async () => {
    const queued = {
      job_id: "a".repeat(32),
      job_type: "baseline",
      status: "queued",
      created_at: "2026-11-13T10:00:00Z",
    };
    vi.mocked(apiPost).mockResolvedValue(queued);

    await submitGenerate({ records: 25, invalid_percent: 0.1 });
    await submitValidation();
    await submitRun({ mode: "baseline", batch_id: "dashboard-run" });
    await submitBenchmark({ records: 25, repetitions: 2 });

    expect(apiPost).toHaveBeenNthCalledWith(1, "/api/v1/jobs/generate", {
      records: 25,
      invalid_percent: 0.1,
    });
    expect(apiPost).toHaveBeenNthCalledWith(2, "/api/v1/jobs/validate", {});
    expect(apiPost).toHaveBeenNthCalledWith(3, "/api/v1/jobs/run", {
      mode: "baseline",
      batch_id: "dashboard-run",
    });
    expect(apiPost).toHaveBeenNthCalledWith(4, "/api/v1/jobs/benchmark", {
      records: 25,
      repetitions: 2,
    });
  });

  it("retrieves only a job's allowlisted logs route", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      job_id: "a".repeat(32),
      stdout: "{}",
      stderr: "",
      truncated: false,
    });
    await expect(getJobLogs("a".repeat(32))).resolves.toMatchObject({
      stdout: "{}",
      truncated: false,
    });
    expect(apiGet).toHaveBeenCalledWith(`/api/v1/jobs/${"a".repeat(32)}/logs`, {
      signal: undefined,
    });
  });

  it("retrieves and validates a persisted job detail", async () => {
    const job = {
      job_id: "b".repeat(32),
      job_type: "optimized",
      status: "running",
      created_at: "2026-11-13T10:00:00Z",
      started_at: "2026-11-13T10:00:01Z",
      completed_at: null,
      exit_code: null,
      error_summary: null,
      report_references: {},
    };
    vi.mocked(apiGet).mockResolvedValueOnce(job);
    await expect(getJob(job.job_id)).resolves.toEqual(job);
    expect(apiGet).toHaveBeenCalledWith(
      `/api/v1/jobs/${job.job_id}`,
      { signal: undefined },
    );
    vi.mocked(apiGet).mockResolvedValueOnce({ ...job, job_id: "other" });
    await expect(getJob(job.job_id)).rejects.toThrow("does not match");
  });
});
