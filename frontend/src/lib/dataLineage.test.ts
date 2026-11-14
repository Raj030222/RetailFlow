import { describe, expect, it } from "vitest";
import {
  associateRunReport,
  getConnectedNodeIds,
  getRunBatchReferences,
  LINEAGE_NODES,
} from "./dataLineage";
import type { JobRecord } from "../types/jobs";

function pipelineJob(): JobRecord {
  return {
    job_id: "a".repeat(32),
    job_type: "baseline",
    status: "succeeded",
    created_at: "2026-11-14T01:00:00Z",
    started_at: "2026-11-14T01:00:01Z",
    completed_at: "2026-11-14T01:04:00Z",
    exit_code: 0,
    error_summary: null,
    report_references: {
      baseline: ["batch-42:metrics", "batch-42:reconciliation"],
    },
  };
}

describe("data lineage metadata", () => {
  it("defines only the three configured inputs and actual published datasets", () => {
    expect(LINEAGE_NODES.filter((node) => node.kind === "source")).toHaveLength(3);
    expect(LINEAGE_NODES.filter((node) => node.kind === "output").map((node) => node.name))
      .toEqual([
        "processed_transactions",
        "revenue_by_product",
        "revenue_by_category",
        "revenue_by_customer",
        "daily_sales",
        "monthly_sales",
        "sales_summary",
        "rejected_records",
        "duplicate_records",
      ]);
  });

  it("extracts a batch only from the selected job's recognized report references", () => {
    expect(getRunBatchReferences(pipelineJob())).toEqual({
      baseline: "batch-42",
    });
    expect(
      getRunBatchReferences({
        ...pipelineJob(),
        report_references: { baseline: ["../untrusted:metrics"] },
      }),
    ).toEqual({});
  });

  it("associates report metrics only when batch, mode, and execution window match", () => {
    const report = {
      metrics: {
        batch_id: "batch-42",
        mode: "baseline",
        run_id: "run-42",
        pipeline_status: "SUCCESS",
        start_time: "2026-11-14T01:00:02Z",
        end_time: "2026-11-14T01:03:00Z",
        output_records: 17,
        publication_state: "PUBLISHED",
        publication_target: "runs/batch-42",
      },
      reconciliation: { output_records: 17 },
    };
    expect(
      associateRunReport(pipelineJob(), "batch-42", "baseline", report),
    ).toMatchObject({
      runId: "run-42",
      outputRecords: 17,
      publicationTarget: "runs/batch-42",
    });
    expect(
      associateRunReport(pipelineJob(), "batch-42", "optimized", report),
    ).toBeNull();
    expect(
      associateRunReport(
        pipelineJob(),
        "batch-42",
        "baseline",
        {
          ...report,
          metrics: { ...report.metrics, end_time: "2026-11-14T01:05:00Z" },
        },
      ),
    ).toBeNull();
  });

  it("finds the selected node and its connected upstream/downstream lineage", () => {
    const connected = getConnectedNodeIds("output-processed_transactions");
    expect(connected.has("source-customers")).toBe(true);
    expect(connected.has("stage-baseline")).toBe(true);
    expect(connected.has("output-rejected_records")).toBe(false);
  });
});
