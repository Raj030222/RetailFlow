import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/dataQualityService", () => ({
  VALIDATION_HISTORY_PAGE_SIZE: 50,
  fetchValidationJobs: vi.fn(),
  fetchValidationOutput: vi.fn(),
}));
vi.mock("../services/jobsService", () => ({
  submitValidation: vi.fn(),
}));

import {
  fetchValidationJobs,
  fetchValidationOutput,
} from "../services/dataQualityService";
import { useDataQuality } from "./useDataQuality";
import type { ValidationOutput, ValidationJobPage } from "../types/dataQuality";
import type { JobRecord, JobSubmission } from "../types/jobs";

function job(
  jobId: string,
  status: JobRecord["status"],
): JobRecord {
  return {
    job_id: jobId,
    job_type: "validate",
    status,
    created_at: "2026-11-14T01:00:00Z",
    started_at: status === "queued" ? null : "2026-11-14T01:00:01Z",
    completed_at: status === "succeeded" ? "2026-11-14T01:00:02Z" : null,
    exit_code: status === "succeeded" ? 0 : null,
    error_summary: null,
    report_references: {},
  };
}

function page(jobs: JobRecord[], scanned = jobs.length): ValidationJobPage {
  return { jobs, scanned, hasMore: scanned === 50 };
}

function output(jobId: string): ValidationOutput {
  return {
    job_id: jobId,
    stdout: '{"status":"PASS","input_records":0}',
    stderr: "",
    truncated: false,
    state: "ready",
    report: { status: "PASS", input_records: 0 },
  };
}

beforeEach(() => {
  vi.mocked(fetchValidationJobs).mockReset();
  vi.mocked(fetchValidationOutput).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDataQuality", () => {
  it("loads persisted validation jobs and fetches logs only after execution is terminal", async () => {
    const runningJob = job("a".repeat(32), "running");
    const completedJob = job("b".repeat(32), "succeeded");
    vi.mocked(fetchValidationJobs).mockResolvedValue(
      page([runningJob, completedJob]),
    );
    vi.mocked(fetchValidationOutput).mockResolvedValue(output(completedJob.job_id));

    const { result, unmount } = renderHook(() => useDataQuality());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() =>
      expect(result.current.outputs[completedJob.job_id]?.state).toBe("ready"),
    );

    expect(result.current.jobs).toEqual([runningJob, completedJob]);
    expect(result.current.activeValidation).toBe(true);
    expect(fetchValidationOutput).toHaveBeenCalledTimes(1);
    expect(fetchValidationOutput).toHaveBeenCalledWith(
      completedJob,
      expect.any(AbortSignal),
    );
    unmount();
  });

  it("loads older API pages using the raw-job offset and appends validation history", async () => {
    const newest = job("c".repeat(32), "succeeded");
    const older = job("d".repeat(32), "succeeded");
    vi.mocked(fetchValidationJobs)
      .mockResolvedValueOnce(page([newest], 50))
      .mockResolvedValueOnce(page([older], 1));
    vi.mocked(fetchValidationOutput).mockImplementation(async (record) =>
      output(record.job_id),
    );

    const { result } = renderHook(() => useDataQuality());
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());
    expect(fetchValidationJobs).toHaveBeenLastCalledWith(50, expect.any(AbortSignal));
    expect(result.current.jobs.map((record) => record.job_id)).toEqual([
      newest.job_id,
      older.job_id,
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it("inserts the persisted queued submission and prevents duplicate active validation", async () => {
    const queuedSubmission: JobSubmission = {
      job_id: "e".repeat(32),
      job_type: "validate",
      status: "queued",
      created_at: "2026-11-14T01:00:00Z",
    };
    vi.mocked(fetchValidationJobs)
      .mockResolvedValueOnce(page([]))
      .mockResolvedValue(page([job(queuedSubmission.job_id, "queued")]));

    const { result } = renderHook(() => useDataQuality());
    await waitFor(() => expect(result.current.status).toBe("empty"));
    const operation = vi.fn(async () => queuedSubmission);

    await act(async () => {
      await expect(
        result.current.submitOnce("validation", operation),
      ).resolves.toEqual(queuedSubmission);
    });
    await waitFor(() =>
      expect(result.current.jobs[0]?.job_id).toBe(queuedSubmission.job_id),
    );
    expect(result.current.isDuplicateActive("validation")).toBe(true);
    const duplicate = vi.fn(async () => queuedSubmission);
    await act(async () => {
      await expect(
        result.current.submitOnce("validation", duplicate),
      ).resolves.toBeNull();
    });
    expect(duplicate).not.toHaveBeenCalled();
  });
});
