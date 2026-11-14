import type { JobRecord, RunReportsResponse } from "../types/jobs";
import type {
  AssociatedRunReport,
  LineageEdge,
  LineageNode,
  PipelineJobType,
} from "../types/lineage";

const analyticalOutputs = [
  "processed_transactions",
  "revenue_by_product",
  "revenue_by_category",
  "revenue_by_customer",
  "daily_sales",
  "monthly_sales",
  "sales_summary",
];

const classifiedOutputs = ["rejected_records", "duplicate_records"];

export const LINEAGE_NODES: LineageNode[] = [
  {
    id: "source-customers",
    name: "customers.csv",
    kind: "source",
    description: "Customer dimension data read from the configured input directory.",
    filePath: "data/generated/customers.csv",
    format: "CSV",
    columns: [
      "customer_id",
      "customer_name",
      "email",
      "city",
      "state",
      "registration_date",
      "created_at",
    ],
  },
  {
    id: "source-products",
    name: "products.csv",
    kind: "source",
    description: "Product dimension data read from the configured input directory.",
    filePath: "data/generated/products.csv",
    format: "CSV",
    columns: [
      "product_id",
      "product_name",
      "category",
      "unit_price",
      "stock_quantity",
      "created_at",
    ],
  },
  {
    id: "source-transactions",
    name: "transactions.csv",
    kind: "source",
    description: "Transaction events read from the configured input directory.",
    filePath: "data/generated/transactions.csv",
    format: "CSV",
    columns: [
      "transaction_id",
      "customer_id",
      "product_id",
      "quantity",
      "transaction_timestamp",
      "ingestion_timestamp",
      "source_file",
      "run_id",
    ],
  },
  {
    id: "stage-ingestion",
    name: "Read input CSVs",
    kind: "stage",
    stageType: "ingestion",
    description:
      "Checks the three required CSV files and their headers, then reads them with explicit Spark schemas and corrupt-record preservation.",
    codeReference: "src/retailflow/ingestion/reader.py — read_inputs",
    inputDatasets: [
      "customers.csv",
      "products.csv",
      "transactions.csv",
    ],
    outputDatasets: ["customers", "products", "transactions"],
  },
  {
    id: "stage-classification",
    name: "Validate & classify",
    kind: "stage",
    stageType: "validation",
    description:
      "Checks transaction and dimension references, rejects invalid transactions, and deterministically separates duplicate transaction IDs from valid rows.",
    codeReference:
      "src/retailflow/validation/quality_checks.py — classify",
    inputDatasets: ["customers", "products", "transactions"],
    outputDatasets: [
      "valid transactions",
      "rejected_records",
      "duplicate_records",
    ],
  },
  {
    id: "stage-baseline",
    name: "Baseline processing",
    kind: "stage",
    stageType: "transformation",
    description:
      "Enriches valid transactions with customer and product dimensions, derives transaction amount/date fields, and builds the analytical aggregates without broadcast hints.",
    codeReference: "src/retailflow/transformations/baseline.py — transform",
    inputDatasets: ["valid transactions", "customers", "products"],
    outputDatasets: analyticalOutputs,
  },
  {
    id: "stage-optimized",
    name: "Optimized processing",
    kind: "stage",
    stageType: "transformation",
    description:
      "Uses the same enrichment and aggregate logic as baseline, broadcasting customer and product dimensions for the optimized join path.",
    codeReference: "src/retailflow/transformations/optimized.py — transform",
    inputDatasets: ["valid transactions", "customers", "products"],
    outputDatasets: analyticalOutputs,
  },
  {
    id: "stage-publication",
    name: "Publish Parquet datasets",
    kind: "stage",
    stageType: "publication",
    description:
      "Stages each dataset as Parquet and publishes the batch directory after reconciliation passes.",
    codeReference: "src/retailflow/publishing/writer.py — publish",
    inputDatasets: [...analyticalOutputs, ...classifiedOutputs],
    outputDatasets: [...analyticalOutputs, ...classifiedOutputs],
  },
  ...[...analyticalOutputs, ...classifiedOutputs].map((name) => ({
    id: `output-${name}`,
    name,
    kind: "output" as const,
    description:
      name === "rejected_records"
        ? "Invalid transaction rows and their rejection reasons."
        : name === "duplicate_records"
          ? "Valid transaction rows discarded by deterministic duplicate selection."
          : `Published analytical dataset: ${name.replaceAll("_", " ")}.`,
    format: "Parquet",
    inputDatasets:
      name === "rejected_records" || name === "duplicate_records"
        ? ["classification"]
        : ["baseline processing", "optimized processing"],
  })),
];

export const LINEAGE_EDGES: LineageEdge[] = [
  { source: "source-customers", target: "stage-ingestion" },
  { source: "source-products", target: "stage-ingestion" },
  { source: "source-transactions", target: "stage-ingestion" },
  { source: "stage-ingestion", target: "stage-classification" },
  { source: "stage-classification", target: "stage-baseline" },
  { source: "stage-classification", target: "stage-optimized" },
  { source: "stage-classification", target: "stage-publication" },
  { source: "stage-baseline", target: "stage-publication" },
  { source: "stage-optimized", target: "stage-publication" },
  ...[...analyticalOutputs, ...classifiedOutputs].map((name) => ({
    source: "stage-publication",
    target: `output-${name}`,
  })),
];

const runModes = ["baseline", "optimized"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getPipelineJobType(job: JobRecord): PipelineJobType | null {
  return job.job_type === "baseline" ||
    job.job_type === "optimized" ||
    job.job_type === "both"
    ? job.job_type
    : null;
}

export function getRunBatchReferences(
  job: JobRecord,
): Partial<Record<(typeof runModes)[number], string>> {
  const jobType = getPipelineJobType(job);
  if (!jobType) return {};
  const modes =
    jobType === "both"
      ? runModes
      : [jobType];
  const result: Partial<Record<(typeof runModes)[number], string>> = {};
  for (const mode of modes) {
    const references = job.report_references[mode] ?? [];
    for (const reference of references) {
      const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,63}):metrics$/.exec(
        reference,
      );
      if (match?.[1]) {
        result[mode] = match[1];
        break;
      }
    }
  }
  return result;
}

export function associateRunReport(
  job: JobRecord,
  batchId: string,
  mode: (typeof runModes)[number],
  report: RunReportsResponse["reports"][string] | undefined,
): AssociatedRunReport | null {
  if (!report || !isRecord(report.metrics)) return null;
  const metrics = report.metrics;
  const startedAt = Date.parse(job.started_at ?? "");
  const completedAt = Date.parse(job.completed_at ?? "");
  const reportStartedAt = Date.parse(
    typeof metrics.start_time === "string" ? metrics.start_time : "",
  );
  const reportCompletedAt = Date.parse(
    typeof metrics.end_time === "string" ? metrics.end_time : "",
  );
  const isWithinJob =
    Number.isFinite(startedAt) &&
    Number.isFinite(completedAt) &&
    Number.isFinite(reportStartedAt) &&
    Number.isFinite(reportCompletedAt) &&
    startedAt <= reportStartedAt &&
    reportStartedAt <= reportCompletedAt &&
    reportCompletedAt <= completedAt;
  if (
    metrics.batch_id !== batchId ||
    metrics.mode !== mode ||
    !isWithinJob
  ) {
    return null;
  }

  const reconciliation = isRecord(report.reconciliation)
    ? report.reconciliation
    : null;
  const outputRecords =
    typeof reconciliation?.output_records === "number"
      ? reconciliation.output_records
      : typeof metrics.output_records === "number"
        ? metrics.output_records
        : null;

  return {
    batchId,
    mode,
    runId: typeof metrics.run_id === "string" ? metrics.run_id : null,
    pipelineStatus:
      typeof metrics.pipeline_status === "string"
        ? metrics.pipeline_status
        : null,
    reconciliationStatus:
      typeof reconciliation?.status === "string"
        ? reconciliation.status
        : null,
    outputRecords:
      outputRecords !== null && Number.isFinite(outputRecords)
        ? outputRecords
        : null,
    publicationState:
      typeof metrics.publication_state === "string"
        ? metrics.publication_state
        : null,
    publicationTarget:
      typeof metrics.publication_target === "string"
        ? metrics.publication_target
        : null,
  };
}

export function getConnectedNodeIds(selectedId: string): Set<string> {
  const connected = new Set([selectedId]);
  const upstream = [selectedId];
  while (upstream.length > 0) {
    const current = upstream.pop();
    if (!current) continue;
    for (const edge of LINEAGE_EDGES) {
      if (edge.target === current && !connected.has(edge.source)) {
        connected.add(edge.source);
        upstream.push(edge.source);
      }
    }
  }
  const downstream = [selectedId];
  while (downstream.length > 0) {
    const current = downstream.pop();
    if (!current) continue;
    for (const edge of LINEAGE_EDGES) {
      if (edge.source === current && !connected.has(edge.target)) {
        connected.add(edge.target);
        downstream.push(edge.target);
      }
    }
  }
  return connected;
}
