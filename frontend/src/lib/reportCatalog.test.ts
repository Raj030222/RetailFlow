import { describe, expect, it } from "vitest";
import { buildReportCatalog } from "./reportCatalog";
import type { JobRecord, RunReportsResponse } from "../types/jobs";

function pipelineJob(): JobRecord {
  return {
    job_id: "job-42",
    job_type: "baseline",
    status: "succeeded",
    created_at: "2026-11-13T10:00:00Z",
    started_at: "2026-11-13T10:00:01Z",
    completed_at: "2026-11-13T10:00:05Z",
    exit_code: 0,
    error_summary: null,
    report_references: {
      baseline: ["batch-42:metrics", "batch-42:reconciliation"],
    },
  };
}

function reports(): RunReportsResponse {
  return {
    batch_id: "batch-42",
    reports: {
      baseline: {
        metrics: {
          batch_id: "batch-42",
          mode: "baseline",
          run_id: "run-42",
          pipeline_status: "SUCCESS",
          start_time: "2026-11-13T10:00:02Z",
          end_time: "2026-11-13T10:00:04Z",
        },
        reconciliation: {
          mode: "baseline",
          status: "PASS",
        },
      },
    },
  };
}

describe("buildReportCatalog", () => {
  it("only verifies a run association when report timestamps match the referenced job window", () => {
    const report = reports();
    const catalog = buildReportCatalog(
      [pipelineJob()],
      new Map([["batch-42", { state: "available", response: report }]]),
      { state: "available", response: { json: null, csv: null, markdown: null } },
      new Map(),
    );

    const metrics = catalog.find((entry) => entry.sourceKind === "run-metrics");
    const reconciliation = catalog.find(
      (entry) => entry.sourceKind === "reconciliation",
    );
    expect(metrics).toMatchObject({
      runId: "run-42",
      jobId: "job-42",
      jobStatus: "succeeded",
      associationVerified: true,
    });
    expect(reconciliation).toMatchObject({
      jobId: "job-42",
      reportStatus: "PASS",
      associationVerified: true,
    });

    const baselineReport = report.reports.baseline;
    if (!baselineReport?.metrics) throw new Error("Baseline metrics are required.");
    baselineReport.metrics.start_time = "2026-11-13T09:59:00Z";
    const unassociated = buildReportCatalog(
      [pipelineJob()],
      new Map([["batch-42", { state: "available", response: report }]]),
      { state: "available", response: { json: null, csv: null, markdown: null } },
      new Map(),
    );
    expect(
      unassociated.find((entry) => entry.sourceKind === "run-metrics"),
    ).toMatchObject({ jobId: null, associationVerified: false });
  });

  it("marks missing referenced reports and unavailable metadata explicitly", () => {
    const catalog = buildReportCatalog(
      [pipelineJob()],
      new Map([["batch-42", { state: "missing", message: "Report was removed." }]]),
      { state: "available", response: { json: null, csv: null, markdown: null } },
      new Map(),
    );

    expect(catalog).toHaveLength(2);
    expect(catalog[0]).toMatchObject({
      available: "unavailable",
      generatedAt: null,
      runId: null,
      jobId: null,
      associationVerified: false,
      message: expect.stringContaining("not present"),
    });
  });

  it("does not attribute fixed-name benchmark artifacts to historical jobs", () => {
    const benchmark = {
      baseline: {
        median_seconds: 4,
        output_records: 10,
        output_counts: {},
        plan: "baseline plan",
      },
      optimized: {
        median_seconds: 2,
        output_records: 10,
        output_counts: {},
        plan: "optimized plan",
      },
      equivalent: true,
      records: 10,
      repetitions: 3,
      improvement_percent: 50,
      performance_assessment: "optimized_faster",
      performance_note: "Optimized median was lower.",
    };
    const catalog = buildReportCatalog(
      [],
      new Map(),
      {
        state: "available",
        response: { json: benchmark, csv: "run,seconds\n1,2", markdown: null },
      },
      new Map(),
    );

    expect(catalog).toHaveLength(3);
    expect(catalog[0]).toMatchObject({
      sourceKind: "benchmark",
      jobId: null,
      associationVerified: false,
      reportStatus: "optimized_faster",
      generatedAt: null,
    });
    expect(catalog.find((entry) => entry.format === "Markdown")).toMatchObject({
      available: "unavailable",
      content: null,
    });
  });
});
