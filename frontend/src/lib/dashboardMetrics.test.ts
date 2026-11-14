import { describe, expect, it } from "vitest";
import { calculatePipelineKpis, formatDuration } from "./dashboardMetrics";
import type { JobRecord } from "../types/jobs";

const created = "2026-11-13T10:00:00+00:00";

function job(
  jobId: string,
  jobType: JobRecord["job_type"],
  status: JobRecord["status"],
  overrides: Partial<JobRecord> = {},
): JobRecord {
  return {
    job_id: jobId,
    job_type: jobType,
    status,
    created_at: created,
    started_at: null,
    completed_at: null,
    exit_code: null,
    error_summary: null,
    report_references: {},
    ...overrides,
  };
}

describe("calculatePipelineKpis", () => {
  it("counts pipeline terminal and active states without counting unrelated operations", () => {
    const jobs = [
      job("one", "baseline", "succeeded", {
        started_at: "2026-11-13T10:00:01Z",
        completed_at: "2026-11-13T10:00:11Z",
      }),
      job("two", "optimized", "failed"),
      job("three", "both", "running", { started_at: "2026-11-13T10:01:00Z" }),
      job("four", "baseline", "queued"),
      job("five", "validate", "succeeded"),
      job("six", "benchmark", "failed"),
    ];

    expect(calculatePipelineKpis(jobs, false)).toEqual({
      total: 4,
      succeeded: 1,
      failed: 1,
      queued: 1,
      running: 1,
      latestDurationSeconds: 10,
      limited: false,
    });
  });

  it("keeps unavailable duration distinct and ignores recovered jobs with unknown timing", () => {
    const jobs = [
      job("old", "baseline", "succeeded", {
        started_at: "2026-11-13T10:00:00Z",
        completed_at: "2026-11-13T10:00:04Z",
      }),
      job("recovered", "optimized", "failed", {
        started_at: "2026-11-13T10:00:00Z",
        completed_at: "2026-11-13T11:00:00Z",
        error_summary: "Backend restarted before completion; prior execution state was not verified.",
      }),
      job("new", "both", "running", { started_at: "2026-11-13T11:01:00Z" }),
    ];

    expect(calculatePipelineKpis(jobs, true).latestDurationSeconds).toBe(4);
    expect(calculatePipelineKpis([job("none", "baseline", "queued")], false).latestDurationSeconds)
      .toBeNull();
    expect(formatDuration(null)).toBe("Not available");
  });

  it("represents a genuinely empty job history as zero runs", () => {
    expect(calculatePipelineKpis([], false)).toMatchObject({
      total: 0,
      succeeded: 0,
      failed: 0,
      queued: 0,
      running: 0,
      latestDurationSeconds: null,
    });
  });
});
