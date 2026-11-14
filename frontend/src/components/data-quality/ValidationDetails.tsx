import { FileText, TerminalSquare } from "lucide-react";
import { formatReportNumber, formatTimestamp } from "../../lib/dashboardMetrics";
import { validationQualityStatus } from "../../lib/validationParser";
import type { ValidationOutput } from "../../types/dataQuality";
import type { JobRecord } from "../../types/jobs";
import { EmptyState, ErrorState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";
import { JobStatusBadge } from "../pipeline/JobStatusBadge";
import { ValidationQualityBadge } from "./ValidationQualityBadge";

const metrics = [
  ["Input records", "input_records"],
  ["Valid records", "valid_records"],
  ["Rejected records", "rejected_records"],
  ["Duplicate records", "duplicate_records"],
  ["Malformed records", "malformed_records"],
] as const;

export function ValidationDetails({
  job,
  output,
}: {
  job: JobRecord | null;
  output: ValidationOutput | undefined;
}) {
  if (!job) {
    return (
      <Panel
        description="Inspect persisted job metadata and captured validation output."
        icon={<TerminalSquare aria-hidden="true" className="h-4 w-4" />}
        title="Validation job details"
      >
        <EmptyState
          description="Select a validation job from the history table to inspect its results and logs."
          title="No validation job selected"
        />
      </Panel>
    );
  }

  const report = output?.report ?? null;
  const qualityStatus = validationQualityStatus(job, output);
  return (
    <Panel
      description={`Job ${job.job_id}`}
      icon={<TerminalSquare aria-hidden="true" className="h-4 w-4" />}
      title="Validation job details"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <JobStatusBadge status={job.status} />
          <ValidationQualityBadge status={qualityStatus} />
        </div>
        <p className="text-xs text-muted-foreground">
          Quality status is parsed from job stdout; execution status is API job metadata.
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-border py-4 text-xs sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd className="mt-1 font-medium">{formatTimestamp(job.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Started</dt>
          <dd className="mt-1 font-medium">{formatTimestamp(job.started_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Completed</dt>
          <dd className="mt-1 font-medium">{formatTimestamp(job.completed_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Exit code</dt>
          <dd className="mt-1 font-medium tabular-nums">
            {job.exit_code === null ? "Not available" : job.exit_code}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reconciliation</dt>
          <dd className="mt-1 font-medium">
            {report?.reconciled === undefined
              ? "Not reported"
              : report.reconciled
                ? "Passed"
                : "Failed"}
          </dd>
        </div>
      </dl>

      {report ? (
        <section aria-label="Selected validation metrics" className="mt-4">
          <h3 className="text-sm font-semibold">Validation metrics</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {metrics.map(([label, key]) => (
              <div className="rounded-md border border-border bg-muted/20 p-3" key={key}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">
                  {formatReportNumber(report[key])}
                </dd>
              </div>
            ))}
          </dl>
          <section aria-label="Rejection reason counts" className="mt-4">
            <h4 className="text-sm font-semibold">Rejection reasons</h4>
            {report.rejection_reason_counts === undefined ? (
              <p className="mt-2 text-xs text-muted-foreground">Not reported</p>
            ) : Object.keys(report.rejection_reason_counts).length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No rejected records</p>
            ) : (
              <dl className="mt-2 divide-y divide-border rounded-md border border-border">
                {Object.entries(report.rejection_reason_counts).map(([reason, count]) => (
                  <div className="flex items-center justify-between gap-3 px-3 py-2" key={reason}>
                    <dt className="break-all font-mono text-xs">{reason}</dt>
                    <dd className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatReportNumber(count)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          {report.error && (
            <p className="mt-3 text-sm text-destructive" role="alert">{report.error}</p>
          )}
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <FileText aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Dataset-level metrics and integrity checks above also reflect this selected job.
          </p>
        </section>
      ) : (
        <section aria-label="Selected validation metrics" className="mt-4">
          {output?.state === "loading" ? (
            <LoadingState label="Retrieving validation output" />
          ) : output?.state === "pending" || job.status === "queued" || job.status === "running" ? (
            <p className="text-xs text-muted-foreground" role="status">
              Validation output will be retrieved after the job completes.
            </p>
          ) : output?.state === "error" ? (
            <ErrorState description={output.message ?? "Validation logs are unavailable."} />
          ) : output?.state === "invalid" ? (
            <ErrorState description="The job returned output, but it did not contain a readable validation JSON report." />
          ) : (
            <p className="text-xs text-muted-foreground" role="status">
              No validation JSON report was returned for this job.
            </p>
          )}
        </section>
      )}

      {job.error_summary && (
        <div className="mt-4">
          <ErrorState
            title={job.status === "failed" ? "Job execution failed" : "Job execution issue"}
            description={job.error_summary}
          />
        </div>
      )}

      <section className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Captured process output</h3>
        {output?.state === "loading" ? (
          <LoadingState className="mt-3" label="Loading job logs" />
        ) : output?.state === "error" ? (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {output.message ?? "Job logs could not be retrieved."}
          </p>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium">Standard output</p>
              <pre className="max-h-72 min-h-24 overflow-auto rounded-md border border-border bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-100">
                {output?.stdout || "No standard output returned."}
              </pre>
            </div>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium">Standard error</p>
              <pre className="max-h-72 min-h-24 overflow-auto rounded-md border border-border bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-100">
                {output?.stderr || "No error output returned."}
              </pre>
            </div>
          </div>
        )}
        {output?.truncated && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-300" role="status">
            The API indicates the captured output was truncated.
          </p>
        )}
      </section>
    </Panel>
  );
}
