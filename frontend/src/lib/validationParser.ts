import type {
  DataQualityReport,
  DatasetName,
  IntegrityCheck,
  ValidationOutput,
  ValidationOutputState,
  ValidationQualityStatus,
} from "../types/dataQuality";
import type { JobRecord } from "../types/jobs";

const datasetNames: DatasetName[] = ["customers", "products", "transactions"];
const dimensionNames = ["customers", "products"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseCountMap<K extends string>(
  value: unknown,
  keys: readonly K[],
): Partial<Record<K, number>> | undefined {
  if (!isObject(value)) return undefined;
  const parsed: Partial<Record<K, number>> = {};
  for (const key of keys) {
    if (isCount(value[key])) parsed[key] = value[key];
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseRejectionReasonCounts(
  value: unknown,
): Record<string, number> | undefined {
  if (!isObject(value)) return undefined;
  const parsed: Record<string, number> = {};
  for (const [reason, count] of Object.entries(value)) {
    if (!isCount(count)) return undefined;
    parsed[reason] = count;
  }
  return parsed;
}

function parseReport(value: unknown): DataQualityReport | null {
  if (!isObject(value) || (value.status !== "PASS" && value.status !== "FAIL")) {
    return null;
  }
  // CLI input/setup failures use {status: "FAIL", error: ...} without a
  // validation count. Do not present that execution error as a quality result.
  if (typeof value.error === "string" && !isCount(value.input_records)) {
    return null;
  }

  const report: DataQualityReport = { status: value.status };
  const countFields = [
    "input_records",
    "valid_records",
    "rejected_records",
    "duplicate_records",
    "malformed_records",
  ] as const;
  for (const field of countFields) {
    if (isCount(value[field])) report[field] = value[field];
  }

  const malformedByDataset = parseCountMap(value.malformed_records_by_dataset, datasetNames);
  const duplicateDimensionKeys = parseCountMap(
    value.duplicate_dimension_keys,
    dimensionNames,
  );
  const missingDimensionKeys = parseCountMap(
    value.missing_dimension_keys,
    dimensionNames,
  );
  const rejectionReasonCounts = parseRejectionReasonCounts(
    value.rejection_reason_counts,
  );
  if (malformedByDataset) report.malformed_records_by_dataset = malformedByDataset;
  if (duplicateDimensionKeys) {
    report.duplicate_dimension_keys = duplicateDimensionKeys;
  }
  if (missingDimensionKeys) {
    report.missing_dimension_keys = missingDimensionKeys;
  }
  if (rejectionReasonCounts) {
    report.rejection_reason_counts = rejectionReasonCounts;
  }
  if (typeof value.reconciled === "boolean") report.reconciled = value.reconciled;
  if (typeof value.error === "string") report.error = value.error;
  return report;
}

function extractJsonObjects(source: string): unknown[] {
  const objects: unknown[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (depth === 0) {
      if (character !== "{") continue;
      start = index;
      depth = 1;
      inString = false;
      escaped = false;
      continue;
    }

    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          objects.push(JSON.parse(source.slice(start, index + 1)) as unknown);
        } catch {
          // Ignore unrelated brace-delimited output and continue scanning.
        }
      }
    }
  }
  return objects;
}

export function parseValidationOutput(stdout: string): {
  state: Extract<ValidationOutputState, "ready" | "empty" | "invalid">;
  report: DataQualityReport | null;
} {
  if (stdout.trim() === "") return { state: "empty", report: null };
  const candidates = extractJsonObjects(stdout);
  for (const candidate of candidates) {
    const report = parseReport(candidate);
    if (report) return { state: "ready", report };
  }
  return { state: "invalid", report: null };
}

export function validationQualityStatus(
  job: JobRecord | null,
  output: ValidationOutput | undefined,
): ValidationQualityStatus {
  if (!job) return "NO DATA";
  if (job.status === "queued" || job.status === "running") return "RUNNING";
  if (output?.state === "loading") return "LOADING";
  if (output?.state === "ready" && output.report) return output.report.status;
  if (output?.state === "invalid" || output?.state === "error") return "ERROR";
  if (job.status !== "succeeded") return "ERROR";
  return "NO DATA";
}

function countCheck(id: string, label: string, value: number | undefined): IntegrityCheck {
  if (value === undefined) {
    return { id, label, status: "unavailable", detail: "Not reported" };
  }
  return {
    id,
    label,
    status: value === 0 ? "passed" : "failed",
    detail: `${value.toLocaleString()} record${value === 1 ? "" : "s"}`,
  };
}

export function buildIntegrityChecks(
  report: DataQualityReport | null,
): IntegrityCheck[] {
  if (!report) {
    return [
      {
        id: "reconciliation",
        label: "Record reconciliation",
        status: "unavailable",
        detail: "Not reported",
      },
      countCheck("rejected", "Rejected records", undefined),
      countCheck("duplicates", "Duplicate records", undefined),
      countCheck("malformed", "Malformed records", undefined),
      countCheck("customer-duplicates", "Duplicate customer keys", undefined),
      countCheck("product-duplicates", "Duplicate product keys", undefined),
      countCheck("customer-missing", "Missing customer keys", undefined),
      countCheck("product-missing", "Missing product keys", undefined),
    ];
  }

  const reconciliation: IntegrityCheck = {
    id: "reconciliation",
    label: "Record reconciliation",
    status:
      report.reconciled === undefined
        ? "unavailable"
        : report.reconciled
          ? "passed"
          : "failed",
    detail:
      report.reconciled === undefined
        ? "Not reported"
        : report.reconciled
          ? "Input records reconcile"
          : "Input record counts do not reconcile",
  };
  return [
    reconciliation,
    countCheck("rejected", "Rejected records", report.rejected_records),
    countCheck("duplicates", "Duplicate records", report.duplicate_records),
    countCheck("malformed", "Malformed records", report.malformed_records),
    countCheck(
      "customer-duplicates",
      "Duplicate customer keys",
      report.duplicate_dimension_keys?.customers,
    ),
    countCheck(
      "product-duplicates",
      "Duplicate product keys",
      report.duplicate_dimension_keys?.products,
    ),
    countCheck(
      "customer-missing",
      "Missing customer keys",
      report.missing_dimension_keys?.customers,
    ),
    countCheck(
      "product-missing",
      "Missing product keys",
      report.missing_dimension_keys?.products,
    ),
  ];
}
