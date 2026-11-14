import { describe, expect, it } from "vitest";
import {
  buildIntegrityChecks,
  parseValidationOutput,
  validationQualityStatus,
} from "./validationParser";
import type { DataQualityReport } from "../types/dataQuality";
import type { JobRecord } from "../types/jobs";

function job(status: JobRecord["status"]): JobRecord {
  return {
    job_id: "a".repeat(32),
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

describe("validationParser", () => {
  it("parses the actual validation fields from JSON embedded in process output", () => {
    const output = [
      "Spark validation finished.",
      JSON.stringify({
        status: "FAIL",
        input_records: 10,
        valid_records: 7,
        rejected_records: 2,
        duplicate_records: 1,
        malformed_records: 0,
        malformed_records_by_dataset: {
          customers: 0,
          products: 0,
          transactions: 0,
        },
        duplicate_dimension_keys: { customers: 1, products: 0 },
        missing_dimension_keys: { customers: 0, products: 0 },
        reconciled: true,
      }),
    ].join("\n");

    expect(parseValidationOutput(output)).toMatchObject({
      state: "ready",
      report: {
        status: "FAIL",
        input_records: 10,
        valid_records: 7,
        rejected_records: 2,
        malformed_records_by_dataset: { transactions: 0 },
        duplicate_dimension_keys: { customers: 1 },
        reconciled: true,
      },
    });
  });

  it("accepts partial reports and preserves legitimate zero counts", () => {
    expect(parseValidationOutput('{"status":"PASS","input_records":0,"valid_records":0}'))
      .toEqual({
        state: "ready",
        report: { status: "PASS", input_records: 0, valid_records: 0 },
      });
    expect(
      parseValidationOutput(
        '{"status":"PASS","rejected_records":-1,"malformed_records_by_dataset":{"customers":0,"products":"bad"}}',
      ),
    ).toEqual({
      state: "ready",
      report: {
        status: "PASS",
        malformed_records_by_dataset: { customers: 0 },
      },
    });
  });

  it("parses exact rejection reason groups including combined reasons", () => {
    expect(
      parseValidationOutput(JSON.stringify({
        status: "FAIL",
        rejected_records: 3,
        rejection_reason_counts: {
          invalid_customer_reference: 1,
          missing_customer_id: 1,
        },
      })),
    ).toMatchObject({
      state: "ready",
      report: {
        rejection_reason_counts: {
          invalid_customer_reference: 1,
          missing_customer_id: 1,
        },
      },
    });
  });

  it("preserves an explicitly empty reason map and older reports without the field", () => {
    expect(parseValidationOutput('{"status":"PASS","rejection_reason_counts":{}}'))
      .toMatchObject({ state: "ready", report: { rejection_reason_counts: {} } });
    expect(parseValidationOutput('{"status":"PASS","rejected_records":0}'))
      .toEqual({ state: "ready", report: { status: "PASS", rejected_records: 0 } });
  });

  it("distinguishes empty output from malformed JSON", () => {
    expect(parseValidationOutput("  ")).toEqual({ state: "empty", report: null });
    expect(parseValidationOutput("not a validation report")).toEqual({
      state: "invalid",
      report: null,
    });
    expect(parseValidationOutput('{"status":"UNKNOWN"}')).toEqual({
      state: "invalid",
      report: null,
    });
  });

  it("does not treat an input-error JSON envelope as a completed quality FAIL", () => {
    const output = parseValidationOutput(JSON.stringify({
      status: "FAIL",
      error: "Missing required inputs: ['transactions.csv']",
    }));
    expect(output).toEqual({ state: "invalid", report: null });
    expect(validationQualityStatus(job("failed"), {
      ...output,
      stdout: "",
      stderr: "",
      truncated: false,
      job_id: "a".repeat(32),
    })).toBe("ERROR");
  });

  it("keeps execution state separate from the validation result", () => {
    const failReport = {
      state: "ready",
      report: { status: "FAIL" },
      stdout: "",
      stderr: "",
      truncated: false,
      job_id: "a".repeat(32),
    } as const;
    expect(validationQualityStatus(job("succeeded"), failReport)).toBe("FAIL");
    expect(validationQualityStatus(job("running"), undefined)).toBe("RUNNING");
    expect(validationQualityStatus(job("failed"), undefined)).toBe("ERROR");
    expect(
      validationQualityStatus(job("succeeded"), {
        ...failReport,
        state: "empty",
        report: null,
      }),
    ).toBe("NO DATA");
  });

  it("marks integrity checks unavailable unless actual metrics support a result", () => {
    const unavailable = buildIntegrityChecks({
      status: "PASS",
      input_records: 0,
    });
    expect(unavailable.find((check) => check.id === "reconciliation")?.status)
      .toBe("unavailable");
    expect(unavailable.find((check) => check.id === "customer-duplicates")?.status)
      .toBe("unavailable");

    const zeroCounts: DataQualityReport = {
      status: "PASS",
      rejected_records: 0,
      duplicate_records: 0,
      malformed_records: 0,
      duplicate_dimension_keys: { customers: 0, products: 0 },
      missing_dimension_keys: { customers: 0, products: 0 },
      reconciled: true,
    };
    expect(buildIntegrityChecks(zeroCounts).every((check) => check.status === "passed"))
      .toBe(true);

    const failed = buildIntegrityChecks({
      status: "FAIL",
      rejected_records: 2,
      duplicate_dimension_keys: { products: 1 },
    });
    expect(failed.find((check) => check.id === "rejected")?.status).toBe("failed");
    expect(failed.find((check) => check.id === "product-duplicates")?.status)
      .toBe("failed");
    expect(failed.find((check) => check.id === "customer-missing")?.status)
      .toBe("unavailable");
  });
});
