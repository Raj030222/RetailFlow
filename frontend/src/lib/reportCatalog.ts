import { getRunBatchReferences, associateRunReport } from "./dataLineage";
import { parseBenchmarkReport } from "../services/dashboardService";
import type {
  BenchmarkReportsResponse,
  JobRecord,
  RunReportsResponse,
} from "../types/jobs";
import type { ValidationOutput } from "../types/dataQuality";
import type {
  ReportCatalogEntry,
  ReportCategory,
  ReportSourceKind,
} from "../types/reports";

export type RunReportLookup =
  | { state: "loading" }
  | { state: "available"; response: RunReportsResponse }
  | { state: "missing" | "error"; message: string };

export type BenchmarkReportLookup =
  | { state: "loading" }
  | { state: "available"; response: BenchmarkReportsResponse }
  | { state: "missing" | "error"; message: string };

export type ValidationOutputLookup =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "loaded"; output: ValidationOutput };

type PipelineMode = "baseline" | "optimized";
type RunReportKind = "metrics" | "reconciliation";

const benchmarkArtifacts = [
  {
    format: "JSON",
    key: "json",
    fileName: "benchmark_results.json",
    previewKind: "json",
  },
  {
    format: "CSV",
    key: "csv",
    fileName: "benchmark_results.csv",
    previewKind: "csv",
  },
  {
    format: "Markdown",
    key: "markdown",
    fileName: "performance_report.md",
    previewKind: "markdown",
  },
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown, key: string): string | null {
  const field = isObject(value) ? value[key] : null;
  return typeof field === "string" ? field : null;
}

function isPipelineMode(value: unknown): value is PipelineMode {
  return value === "baseline" || value === "optimized";
}

function modeFromReport(
  report: RunReportsResponse["reports"][string],
  label: string,
  kind: RunReportKind,
): PipelineMode | null {
  const value = kind === "metrics" ? report.metrics : report.reconciliation;
  const reportMode = getString(value, "mode");
  if (isPipelineMode(reportMode)) return reportMode;
  return isPipelineMode(label) ? label : null;
}

function reportStatus(value: unknown): string | null {
  const status = getString(value, "pipeline_status") ?? getString(value, "status");
  return status;
}

function generatedAt(value: unknown): string | null {
  return (
    getString(value, "end_time") ??
    getString(value, "completed_at") ??
    getString(value, "generated_at")
  );
}

function matchingJob(
  jobs: JobRecord[],
  batchId: string,
  mode: PipelineMode,
  report: RunReportsResponse["reports"][string],
): JobRecord | null {
  return (
    jobs.find(
      (job) =>
        getRunBatchReferences(job)[mode] === batchId &&
        associateRunReport(job, batchId, mode, report) !== null,
    ) ?? null
  );
}

function reportEntry({
  id,
  name,
  category,
  sourceKind,
  batchId,
  mode,
  kind,
  content,
  job,
  generated,
  status,
}: {
  id: string;
  name: string;
  category: ReportCategory;
  sourceKind: ReportSourceKind;
  batchId: string;
  mode: PipelineMode | null;
  kind: RunReportKind;
  content: unknown;
  job: JobRecord | null;
  generated: string | null;
  status: string | null;
}): ReportCatalogEntry {
  const modeName = mode ?? "mode_unavailable";
  return {
    id,
    name,
    category,
    format: "JSON",
    previewKind: "json",
    sourceKind,
    fileName: `retailflow_${batchId}_${modeName}_${kind}.json`,
    available: "available",
    content,
    generatedAt: generated,
    batchId,
    runId: getString(content, "run_id"),
    jobId: job?.job_id ?? null,
    jobStatus: job?.status ?? null,
    jobType: job?.job_type ?? null,
    reportStatus: status,
    associationVerified: job !== null,
    message: job
      ? "Execution association verified from the report batch, mode, and report timestamps within the job window."
      : "Execution association unavailable.",
  };
}

function unavailableRunEntry(
  batchId: string,
  mode: PipelineMode,
  kind: RunReportKind,
  message: string,
): ReportCatalogEntry {
  const label = mode === "baseline" ? "Baseline" : "Optimized";
  const noun = kind === "metrics" ? "pipeline metrics" : "reconciliation";
  return {
    id: `run-${batchId}-${mode}-${kind}`,
    name: `${label} ${noun} · ${batchId}`,
    category: kind === "metrics" ? "Pipeline Execution" : "Data Quality",
    format: "Not available",
    previewKind: "unavailable",
    sourceKind: kind === "metrics" ? "run-metrics" : "reconciliation",
    fileName: null,
    available: "unavailable",
    content: null,
    generatedAt: null,
    batchId,
    runId: null,
    jobId: null,
    jobStatus: null,
    jobType: null,
    reportStatus: null,
    associationVerified: false,
    message,
  };
}

function pipelineEntries(
  jobs: JobRecord[],
  lookups: ReadonlyMap<string, RunReportLookup>,
): ReportCatalogEntry[] {
  const referencedModes = new Map<string, Set<PipelineMode>>();
  for (const job of jobs) {
    for (const [mode, batchId] of Object.entries(getRunBatchReferences(job))) {
      if (!batchId || !isPipelineMode(mode)) continue;
      const modes = referencedModes.get(batchId) ?? new Set<PipelineMode>();
      modes.add(mode);
      referencedModes.set(batchId, modes);
    }
  }

  const entries = new Map<string, { entry: ReportCatalogEntry; preferred: boolean }>();
  for (const [batchId, lookup] of lookups) {
    if (lookup.state !== "available" || lookup.response.batch_id !== batchId) {
      continue;
    }
    for (const [label, report] of Object.entries(lookup.response.reports)) {
      const metrics = report.metrics;
      const reconciliation = report.reconciliation;
      const metricMode = metrics
        ? modeFromReport(report, label, "metrics")
        : null;
      const reconciliationMode = reconciliation
        ? modeFromReport(report, label, "reconciliation")
        : null;
      const groupModes = new Set(
        [metricMode, reconciliationMode].filter(
          (mode): mode is PipelineMode => mode !== null,
        ),
      );

      for (const mode of groupModes) {
        const job = matchingJob(jobs, batchId, mode, report);
        const explicitMode = label === mode;
        if (metrics && metricMode === mode) {
          const entry = reportEntry({
            id: `run-${batchId}-${mode}-metrics`,
            name: `${mode === "baseline" ? "Baseline" : "Optimized"} pipeline metrics · ${batchId}`,
            category: "Pipeline Execution",
            sourceKind: "run-metrics",
            batchId,
            mode,
            kind: "metrics",
            content: metrics,
            job: job && getString(metrics, "mode") === mode ? job : null,
            generated: generatedAt(metrics),
            status: reportStatus(metrics),
          });
          const key = `${batchId}:${mode}:metrics`;
          const previous = entries.get(key);
          if (!previous || (!previous.preferred && explicitMode)) {
            entries.set(key, { entry, preferred: explicitMode });
          }
        }

        if (reconciliation && reconciliationMode === mode) {
          const reconciliationReportMode = getString(reconciliation, "mode");
          const verifiedJob =
            job &&
            (reconciliationReportMode === null ||
              reconciliationReportMode === mode)
              ? job
              : null;
          const entry = reportEntry({
            id: `run-${batchId}-${mode}-reconciliation`,
            name: `${mode === "baseline" ? "Baseline" : "Optimized"} reconciliation · ${batchId}`,
            category: "Data Quality",
            sourceKind: "reconciliation",
            batchId,
            mode,
            kind: "reconciliation",
            content: reconciliation,
            job: verifiedJob,
            generated: generatedAt(reconciliation),
            status: reportStatus(reconciliation),
          });
          const key = `${batchId}:${mode}:reconciliation`;
          const previous = entries.get(key);
          if (!previous || (!previous.preferred && explicitMode)) {
            entries.set(key, { entry, preferred: explicitMode });
          }
        }
      }
    }
  }

  for (const [batchId, modes] of referencedModes) {
    const lookup = lookups.get(batchId);
    const message =
      lookup?.state === "loading"
        ? "Loading reports for this referenced batch."
        : lookup?.state === "missing"
        ? "The referenced report file is not present. Batch reports may be overwritten or removed."
        : lookup?.state === "error"
          ? lookup.message
          : "No report content for this mode was returned by the report API.";
    for (const mode of modes) {
      for (const kind of ["metrics", "reconciliation"] as const) {
        const key = `${batchId}:${mode}:${kind}`;
        if (!entries.has(key)) {
          entries.set(key, {
            entry: unavailableRunEntry(batchId, mode, kind, message),
            preferred: true,
          });
        }
      }
    }
  }

  return [...entries.values()].map(({ entry }) => entry);
}

function benchmarkStatus(value: unknown): string {
  if (getString(value, "status") === "FAILED") return "FAILED";
  const report = parseBenchmarkReport(value);
  if (!report) return "Report structure unavailable";
  if (!report.equivalent) return "NOT EQUIVALENT";
  if (
    report.repetitions < 2 ||
    report.performance_assessment === "insufficient_repetitions"
  ) {
    return "INSUFFICIENT REPETITIONS";
  }
  return report.performance_assessment;
}

function benchmarkEntries(
  lookup: BenchmarkReportLookup,
): ReportCatalogEntry[] {
  if (lookup.state !== "available") return [];
  if (
    lookup.response.json === null &&
    lookup.response.csv === null &&
    lookup.response.markdown === null
  ) {
    return [];
  }
  return benchmarkArtifacts.map((artifact) => {
    const content = lookup.response[artifact.key] ?? null;
    const available = content !== null;
    const status =
      artifact.key === "json" && available
        ? benchmarkStatus(content)
        : null;
    const message =
      artifact.key === "json"
        ? "Latest fixed-name benchmark report. The API does not expose a historical job association."
        : "Latest available fixed-name artifact. Its per-file generation time and benchmark job association are unavailable.";

    return {
      id: `benchmark-${artifact.key}`,
      name: artifact.fileName,
      category: "Benchmark",
      format: artifact.format,
      previewKind: artifact.previewKind,
      sourceKind: "benchmark",
      fileName: available ? artifact.fileName : null,
      available: available ? "available" : "unavailable",
      content,
      generatedAt:
        artifact.key === "json" && available ? generatedAt(content) : null,
      batchId:
        artifact.key === "json" && available
          ? getString(content, "batch_id")
          : null,
      runId:
        artifact.key === "json" && available
          ? getString(content, "run_id")
          : null,
      jobId: null,
      jobStatus: null,
      jobType: null,
      reportStatus: status,
      associationVerified: false,
      message: available
        ? message
        : `${artifact.fileName} is unavailable. ${message}`,
    };
  });
}

function validationEntries(
  jobs: JobRecord[],
  outputs: ReadonlyMap<string, ValidationOutputLookup>,
): ReportCatalogEntry[] {
  return jobs
    .filter((job) => job.job_type === "validate")
    .map((job) => {
      const lookup = outputs.get(job.job_id);
      const output = lookup?.state === "loaded" ? lookup.output : null;
      const report = output?.report;
      const hasReport = output?.state === "ready" && report !== null;
      const hasRawOutput =
        output?.state === "invalid" &&
        (output.stdout.length > 0 || output.stderr.length > 0);
      const message = lookup?.state === "error"
        ? lookup.message
        : lookup?.state === "loaded" && output?.state === "empty"
          ? "No validation report was captured in this job's standard output."
          : lookup?.state === "loaded" && output?.state === "invalid"
            ? "This job's logs are available, but no parseable validation report was found."
            : "Validation output is read from this job's persisted logs on selection; it is not a separate report file.";

      return {
        id: `validation-${job.job_id}`,
        name: `Validation job output · ${job.job_id}`,
        category: "Data Quality" as const,
        format: hasReport ? "JSON" as const : "Job logs" as const,
        previewKind: "validation" as const,
        sourceKind: "validation-job" as const,
        fileName: hasReport ? `validation_${job.job_id}.json` : null,
        available: hasReport || hasRawOutput
          ? "available" as const
          : lookup?.state === "loaded" || lookup?.state === "error"
            ? "unavailable" as const
            : "on-demand" as const,
        content: hasReport
          ? report
          : hasRawOutput
            ? [output?.stdout, output?.stderr].filter(Boolean).join("\n\n")
            : null,
        generatedAt: null,
        batchId: null,
        runId: null,
        jobId: job.job_id,
        jobStatus: job.status,
        jobType: job.job_type,
        reportStatus: report?.status ?? null,
        associationVerified: true,
        message,
      };
    });
}

export function buildReportCatalog(
  jobs: JobRecord[],
  runLookups: ReadonlyMap<string, RunReportLookup>,
  benchmarkLookup: BenchmarkReportLookup,
  validationOutputs: ReadonlyMap<string, ValidationOutputLookup>,
): ReportCatalogEntry[] {
  return [
    ...pipelineEntries(jobs, runLookups),
    ...validationEntries(jobs, validationOutputs),
    ...benchmarkEntries(benchmarkLookup),
  ];
}
