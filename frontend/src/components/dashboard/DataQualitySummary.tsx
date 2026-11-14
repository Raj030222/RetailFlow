import { CheckCircle2, XCircle } from "lucide-react";
import type {
  QualityWidgetData,
} from "../../types/dashboard";
import type {
  ReconciliationReport,
  ValidationFailureReport,
  ValidationReport,
} from "../../types/jobs";
import { formatReportNumber } from "../../lib/dashboardMetrics";
import { EmptyState, ErrorState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";

function isValidation(
  report: ValidationReport | ReconciliationReport | ValidationFailureReport,
): report is ValidationReport {
  return "malformed_records" in report;
}

const qualityFields = [
  { label: "Input records", key: "input_records" },
  { label: "Valid records", key: "valid_records" },
  { label: "Rejected records", key: "rejected_records" },
  { label: "Duplicate records", key: "duplicate_records" },
] as const;

export function DataQualitySummary({ data }: { data: QualityWidgetData }) {
  if (data.status === "loading") {
    return (
      <Panel description="Most recent validation output or reconciliation report." title="Data quality">
        <LoadingState label="Loading quality report" />
      </Panel>
    );
  }
  if (data.status === "error") {
    return (
      <Panel title="Data quality">
        <ErrorState description={data.message ?? "Quality information is unavailable."} />
      </Panel>
    );
  }
  if (!data.report) {
    return (
      <Panel title="Data quality">
        <EmptyState
          description={data.message ?? "No validation report available."}
          title="No validation report available"
        />
      </Panel>
    );
  }

  const report = data.report;
  const validation = isValidation(report);
  const statusLabel = report.status;
  const sourceLabel =
    data.source === "validation"
      ? "Validation"
      : data.source === "reconciliation"
        ? "Reconciliation"
        : "Report";
  const title =
    data.source === "validation"
      ? "Data quality"
      : data.source === "reconciliation"
        ? "Pipeline reconciliation"
        : "Quality report";
  const statusClass =
    statusLabel === "PASS"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "bg-destructive/10 text-destructive";

  return (
    <Panel
      action={
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
          {statusLabel === "PASS" ? (
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {data.source === "validation" ? statusLabel : `${sourceLabel} ${statusLabel}`}
        </span>
      }
      description={
        data.source === "validation"
          ? "From the latest validation job output. Execution status is reported separately."
          : data.source === "reconciliation"
            ? "Pipeline reconciliation status and reported counts; this does not represent validation quality."
            : "The source of this quality report is unavailable."
      }
      title={title}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        {qualityFields.map(({ label, key }) => (
          <div key={key}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {key in report
                ? formatReportNumber(report[key as keyof typeof report])
                : "Not reported"}
            </dd>
          </div>
        ))}
        <div className="col-span-2 border-t border-border pt-3">
          <dt className="text-xs text-muted-foreground">Malformed records</dt>
          <dd className="mt-1 text-sm font-medium">
            {validation ? formatReportNumber(report.malformed_records) : "Not reported"}
          </dd>
        </div>
      </dl>
      {validation && report.reconciled === false && (
        <p className="mt-3 text-xs text-destructive">
          Record counts did not reconcile in this validation report.
        </p>
      )}
      {"error" in report && (
        <p className="mt-3 text-xs leading-5 text-destructive">{report.error}</p>
      )}
      {data.status === "ready" && data.message && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300" role="status">
          Showing the last available report. The latest refresh was incomplete.
        </p>
      )}
    </Panel>
  );
}
