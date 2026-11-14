import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/jobsService", () => ({
  getJob: vi.fn(),
  getJobLogs: vi.fn(),
  listJobs: vi.fn(),
}));

import { getJob, getJobLogs, listJobs } from "../services/jobsService";
import { usePipelineJobs } from "./usePipelineJobs";
import type { JobRecord, JobSubmission } from "../types/jobs";

function makeJob(status: JobRecord["status"]): JobRecord {
  return {
    job_id: "a".repeat(32),
    job_type: "baseline",
    status,
    created_at: "2026-11-13T10:00:00Z",
    started_at: status === "queued" ? null : "2026-11-13T10:00:01Z",
    completed_at: status === "succeeded" ? "2026-11-13T10:00:02Z" : null,
    exit_code: status === "succeeded" ? 0 : null,
    error_summary: null,
    report_references: {},
  };
}

const logs = {
  job_id: "a".repeat(32),
  stdout: "pipeline started\n",
  stderr: "",
  truncated: false,
};

beforeEach(() => {
  vi.mocked(getJob).mockReset();
  vi.mocked(getJobLogs).mockReset();
  vi.mocked(listJobs).mockReset();
  vi.mocked(getJob).mockResolvedValue(makeJob("running"));
  vi.mocked(getJobLogs).mockResolvedValue(logs);
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

describe("usePipelineJobs", () => {
  it("loads persisted jobs and polls job status and logs while work is active", async () => {
    vi.useFakeTimers();
    vi.mocked(listJobs).mockImplementation(async () => [makeJob("running")]);
    const { result, unmount } = renderHook(() => usePipelineJobs());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.selectedJobId).toBe("a".repeat(32));
    expect(getJobLogs).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listJobs).toHaveBeenCalledTimes(2);
    expect(getJobLogs).toHaveBeenCalledTimes(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("prevents resubmission of an exact request while its returned job is active", async () => {
    vi.mocked(listJobs).mockResolvedValue([]);
    const { result } = renderHook(() => usePipelineJobs());
    await waitFor(() => expect(result.current.status).toBe("empty"));
    const submission: JobSubmission = {
      job_id: "b".repeat(32),
      job_type: "generate",
      status: "queued",
      created_at: "2026-11-13T10:00:00Z",
    };
    const operation = vi.fn().mockResolvedValue(submission);
    await act(async () => {
      await result.current.submitOnce("generate:10000", operation);
    });
    expect(result.current.isDuplicateActive("generate:10000")).toBe(true);

    const duplicateOperation = vi.fn().mockResolvedValue(submission);
    await act(async () => {
      await expect(
        result.current.submitOnce("generate:10000", duplicateOperation),
      ).resolves.toBeNull();
    });
    expect(duplicateOperation).not.toHaveBeenCalled();
  });


  it("loads older jobs through the API offset and reports whether another page exists", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...makeJob("succeeded"),
      job_id: index.toString(16).padStart(32, "0"),
    }));
    const olderJob = {
      ...makeJob("succeeded"),
      job_id: "f".repeat(32),
    };
    vi.mocked(listJobs).mockImplementation(async (_limit, offset = 0) =>
      offset === 0 ? firstPage : [olderJob],
    );
    const { result } = renderHook(() => usePipelineJobs());
    await waitFor(() => expect(result.current.jobs).toHaveLength(100));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });
    expect(listJobs).toHaveBeenLastCalledWith(100, 100, expect.any(AbortSignal));
    expect(result.current.jobs).toHaveLength(101);
    expect(result.current.hasMore).toBe(false);
  });

  it("stops active polling when the document is hidden", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    vi.mocked(listJobs).mockResolvedValue([]);
    const { unmount } = renderHook(() => usePipelineJobs());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(listJobs).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not poll the job list after the loaded history becomes idle", async () => {
    vi.useFakeTimers();
    vi.mocked(listJobs).mockResolvedValue([makeJob("succeeded")]);
    const { unmount } = renderHook(() => usePipelineJobs());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(listJobs).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("ignores stale detail and log responses after selecting a newer job", async () => {
    const first = { ...makeJob("succeeded"), job_id: "a".repeat(32) };
    const second = { ...makeJob("succeeded"), job_id: "b".repeat(32) };
    const jobResolvers = new Map<string, (value: JobRecord) => void>();
    const logResolvers = new Map<
      string,
      (value: typeof logs) => void
    >();
    vi.mocked(listJobs).mockResolvedValue([first, second]);
    vi.mocked(getJob).mockImplementation(
      (jobId) =>
        new Promise((resolve) => {
          jobResolvers.set(jobId, resolve);
        }),
    );
    vi.mocked(getJobLogs).mockImplementation(
      (jobId) =>
        new Promise((resolve) => {
          logResolvers.set(jobId, resolve);
        }),
    );
    const { result } = renderHook(() => usePipelineJobs());
    await waitFor(() => expect(result.current.selectedJobId).toBe(first.job_id));

    act(() => result.current.selectJob(second.job_id));
    await waitFor(() => expect(jobResolvers.has(second.job_id)).toBe(true));
    await act(async () => {
      jobResolvers.get(second.job_id)?.(second);
      logResolvers.get(second.job_id)?.({
        ...logs,
        job_id: second.job_id,
        stdout: "new selection",
      });
    });
    await waitFor(() => expect(result.current.stdout).toBe("new selection"));

    await act(async () => {
      jobResolvers.get(first.job_id)?.(first);
      logResolvers.get(first.job_id)?.({
        ...logs,
        job_id: first.job_id,
        stdout: "stale selection",
      });
    });
    expect(result.current.selectedJob?.job_id).toBe(second.job_id);
    expect(result.current.stdout).toBe("new selection");
  });
});
