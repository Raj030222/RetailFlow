import {
  CheckCircle2,
  Copy,
  Database,
  FileWarning,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { formatReportNumber, formatTimestamp } from "../../lib/dashboardMetrics";
import type {
  DataQualityReport,
  ValidationQualityStatus,
} from "../../types/dataQuality";
import { KpiCard } from "../dashboard/KpiCard";

export function DataQualityKpiCards({
  report,
  status,
  reportCreatedAt,
  loading = false,
}: {
  report: DataQualityReport | null;
  status: ValidationQualityStatus;
  reportCreatedAt: string | null;
  loading?: boolean;
}) {
  const reportDetail = loading
    ? "Loading the latest validation data."
    : report
    ? reportCreatedAt
      ? `Selected report created ${formatTimestamp(reportCreatedAt)}.`
      : "Selected validation report."
    : "No readable validation report is selected.";
  const statusTone = status === "PASS" ? "success" : status === "FAIL" || status === "ERROR" ? "danger" : "default";

  return (
    <section
      aria-label="Validation metrics"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
    >
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2 lg:col-span-3 2xl:col-span-6">
        Input records are split into valid, rejected, and duplicate records. Duplicate
        records are excluded from rejected records. Malformed records are a separate
        quality count and may overlap these groups.
      </p>
      <KpiCard
        detail={reportDetail}
        icon={Database}
        label="Total input records"
        loading={loading}
        value={formatReportNumber(report?.input_records)}
      />
      <KpiCard
        detail={reportDetail}
        icon={CheckCircle2}
        label="Valid records"
        loading={loading}
        tone="success"
        value={formatReportNumber(report?.valid_records)}
      />
      <KpiCard
        detail={reportDetail}
        icon={XCircle}
        label="Rejected records"
        loading={loading}
        tone={
          report?.rejected_records !== undefined && report.rejected_records > 0
            ? "danger"
            : "default"
        }
        value={formatReportNumber(report?.rejected_records)}
      />
      <KpiCard
        detail={reportDetail}
        icon={Copy}
        label="Duplicate records"
        loading={loading}
        tone={
          report?.duplicate_records !== undefined && report.duplicate_records > 0
            ? "danger"
            : "default"
        }
        value={formatReportNumber(report?.duplicate_records)}
      />
      <KpiCard
        detail={reportDetail}
        icon={FileWarning}
        label="Malformed records"
        loading={loading}
        tone={
          report?.malformed_records !== undefined && report.malformed_records > 0
            ? "danger"
            : "default"
        }
        value={formatReportNumber(report?.malformed_records)}
      />
      <KpiCard
        detail="Data quality status; job execution is shown separately below."
        icon={ShieldCheck}
        label="Validation status"
        loading={loading}
        tone={statusTone}
        value={status}
      />
    </section>
  );
}
