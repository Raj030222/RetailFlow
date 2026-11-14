import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ErrorState, EmptyState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";
import { Button } from "../ui/button";
import { JobStatusBadge } from "../pipeline/JobStatusBadge";
import { formatReportNumber, formatTimestamp } from "../../lib/dashboardMetrics";
import { formatJobDuration } from "../../lib/pipelineJobUtils";
import { parseValidationLog } from "../../services/dashboardService";
import { getJobBatchIds, operationLabel } from "../../lib/runHistory";
import type { JobRecord } from "../../types/jobs";
import type { AssociatedRunReportResult } from "../../services/lineageService";

const COLLAPSED_LOG_LINES = 500;

async function copyText(value: string, successMessage: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard access is unavailable.");
    }
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error("Clipboard access is unavailable in this browser.");
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-xs text-foreground">{children}</dd>
    </div>
  );
}

function ValidationInsights({ stdout }: { stdout: string }) {
  const result = parseValidationLog(stdout).report;
  if (!result) {
    return (
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        No parseable validation result is present in the returned standard output.
      </p>
    );
  }
  if ("error" in result) {
    return (
      <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs font-semibold text-destructive">
          Data-quality result: FAIL
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold">
        Data-quality result:{" "}
        <span
          className={
            result.status === "PASS"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-destructive"
          }
        >
          {result.status}
        </span>
      </p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        This result is independent of the job execution status above.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          ["Input records", result.input_records],
          ["Valid records", result.valid_records],
          ["Rejected records", result.rejected_records],
          ["Duplicate records", result.duplicate_records],
          ["Malformed records", result.malformed_records],
        ].map(([label, count]) => (
          <div key={String(label)}>
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xs font-medium tabular-nums">
              {formatReportNumber(count)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ExecutionLogs({
  jobId,
  stdout,
  stderr,
  truncated,
  loading,
  error,
}: {
  jobId: string;
  stdout: string;
  stderr: string;
  truncated: boolean;
  loading: boolean;
  error: string | null;
}) {
  const [stream, setStream] = useState<"stdout" | "stderr">("stdout");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const text = stream === "stdout" ? stdout : stderr;
  const allLines = text.split(/\r?\n/);
  const matchingLines = query.trim()
    ? allLines.filter((line) =>
        line.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      )
    : allLines;
  const displayedLines = expanded
    ? matchingLines
    : matchingLines.slice(0, COLLAPSED_LOG_LINES);

  return (
    <section aria-labelledby={`logs-heading-${jobId}`} className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" id={`logs-heading-${jobId}`}>
          Execution logs
        </h3>
        <Button
          disabled={loading || (!stdout && !stderr)}
          onClick={() =>
            void copyText(
              `STDOUT\n${stdout}\n\nSTDERR\n${stderr}`,
              "Loaded execution logs copied",
            )
          }
          size="sm"
          variant="outline"
        >
          <Clipboard aria-hidden="true" className="h-3.5 w-3.5" />
          Copy loaded logs
        </Button>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        Search is limited to the bounded output returned by the API. Standard output and standard error are separate streams; no log levels are inferred.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(["stdout", "stderr"] as const).map((name) => (
          <button
            aria-pressed={stream === name}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              stream === name
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
            key={name}
            onClick={() => setStream(name)}
            type="button"
          >
            {name}
          </button>
        ))}
        <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            aria-label={`Search loaded ${stream} logs`}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${stream}`}
            type="search"
            value={query}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-xs text-destructive" role="alert">{error}</p>}
      {loading ? (
        <LoadingState className="mt-4" label="Loading execution logs…" />
      ) : (
        <>
          <pre
            aria-label={`${stream} execution log`}
            className="mt-3 max-h-[360px] min-h-28 overflow-auto rounded-md border border-border bg-slate-950 p-4 font-mono text-[11px] leading-5 text-slate-100"
          >
            {text.length === 0
              ? `No ${stream === "stdout" ? "standard output" : "error output"} captured.`
              : matchingLines.length === 0
                ? "No loaded log lines match the search."
                : displayedLines.join("\n")}
          </pre>
          {matchingLines.length > COLLAPSED_LOG_LINES && (
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {expanded
                  ? `Showing all ${matchingLines.length.toLocaleString()} matching lines.`
                  : `Showing first ${COLLAPSED_LOG_LINES} of ${matchingLines.length.toLocaleString()} matching lines.`}
              </span>
              <Button
                onClick={() => setExpanded((value) => !value)}
                size="sm"
                variant="ghost"
              >
                {expanded ? (
                  <>
                    <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
                    Collapse
                  </>
                ) : (
                  <>
                    <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                    Expand
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}
      {truncated && (
        <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300" role="status">
          The API indicates the returned log excerpt was truncated to its configured limit.
        </p>
      )}
    </section>
  );
}

export function ExecutionDetails({
  selectedJobId,
  job,
  detailsLoading,
  detailsError,
  stdout,
  stderr,
  logsTruncated,
  logsError,
  reports,
}: {
  selectedJobId: string | null;
  job: JobRecord | null;
  detailsLoading: boolean;
  detailsError: string | null;
  stdout: string;
  stderr: string;
  logsTruncated: boolean;
  logsError: string | null;
  reports: AssociatedRunReportResult;
}) {
  if (!selectedJobId) {
    return (
      <Panel title="Execution details">
        <EmptyState
          description="Select a persisted execution to inspect its metadata, outcome, and logs."
          title="No execution selected"
        />
      </Panel>
    );
  }

  if (!job) {
    return (
      <Panel title="Execution details">
        {detailsError && <ErrorState description={detailsError} title="Job details unavailable" />}
        {detailsLoading && <LoadingState label="Loading selected execution…" />}
      </Panel>
    );
  }

  const batchIds = getJobBatchIds(job);
  const isActive = job.status === "queued" || job.status === "running";
  const validation = job.job_type === "validate" && !isActive;

  return (
    <Panel
      description="Fields below come from the selected persisted job, its returned logs, or a report verified for this job."
      title="Execution details"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">Full job ID</p>
          <p className="mt-1 break-all font-mono text-xs">{job.job_id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() =>
              void copyText(job.job_id, "Job ID copied")
            }
            size="sm"
            variant="outline"
          >
            <Clipboard aria-hidden="true" className="h-3.5 w-3.5" />
            Copy ID
          </Button>
          <JobStatusBadge status={job.status} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-border py-4 sm:grid-cols-3">
        <Field label="Operation">{operationLabel(job.job_type)}</Field>
        <Field label="Created at">{formatTimestamp(job.created_at)}</Field>
        <Field label="Started at">{formatTimestamp(job.started_at)}</Field>
        <Field label="Completed at">{formatTimestamp(job.completed_at)}</Field>
        <Field label="Duration">{formatJobDuration(job)}</Field>
        <Field label="Exit code">
          {job.exit_code === null ? "Not available" : job.exit_code}
        </Field>
        <Field label="Batch ID · from report references">
          {batchIds.length > 0 ? batchIds.join(", ") : "Not available"}
        </Field>
      </dl>

      {detailsError && (
        <div className="mt-4">
          <ErrorState description={detailsError} title="Job details refresh failed" />
        </div>
      )}
      {job.error_summary && (
        <div className="mt-4">
          <ErrorState
            description={job.error_summary}
            title={job.status === "failed" ? "Execution failed" : "Execution issue"}
          />
        </div>
      )}
      {job.report_references &&
        Object.entries(job.report_references).some(([, refs]) => refs.length > 0) && (
          <div className="mt-4">
            <p className="text-[11px] font-medium text-muted-foreground">
              Report references
            </p>
            <ul className="mt-1 space-y-1 text-xs">
              {Object.entries(job.report_references)
                .filter(([, references]) => references.length > 0)
                .map(([group, references]) => (
                  <li className="break-all" key={group}>
                    <span className="text-muted-foreground">{group}: </span>
                    <code>{references.join(", ")}</code>
                  </li>
                ))}
            </ul>
          </div>
        )}

      {validation && (
        <section className="mt-4" aria-labelledby={`validation-result-${job.job_id}`}>
          <h3
            className="text-xs font-semibold"
            id={`validation-result-${job.job_id}`}
          >
            Validation result
          </h3>
          <ValidationInsights stdout={stdout} />
        </section>
      )}

      {job.job_type === "generate" && (
        <p className="mt-4 rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          The persisted job response does not include generation request parameters. Only values present in this job’s returned logs can be inspected.
        </p>
      )}
      {job.job_type === "benchmark" && (
        <p className="mt-4 rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          The benchmark endpoint exposes a single latest report without a job ID or execution timestamp. It is not shown here as this historical job’s result.
        </p>
      )}

      {job.job_type === "baseline" ||
      job.job_type === "optimized" ||
      job.job_type === "both" ? (
        <section className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Related pipeline reports</h3>
            {reports.state === "available" && (
              <Link
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                to={`/lineage?jobId=${encodeURIComponent(job.job_id)}`}
              >
                <span className="inline-flex items-center gap-1">
                  View verified lineage
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
              </Link>
            )}
          </div>
          {reports.state === "loading" ? (
            <LoadingState className="mt-3" label="Checking report association…" />
          ) : reports.state === "available" ? (
            <div className="mt-3 space-y-2">
              {reports.reports.map((report) => (
                <div
                  className="rounded-md border border-border bg-muted/30 p-3 text-xs"
                  key={`${report.mode}-${report.batchId}`}
                >
                  <p className="font-medium">
                    {report.mode} · batch {report.batchId}
                  </p>
                  <p className="mt-1 break-all text-muted-foreground">
                    Pipeline run ID: {report.runId ?? "Not reported"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Pipeline status: {report.pipelineStatus ?? "Not reported"}
                    {" · "}reconciliation: {report.reconciliationStatus ?? "Not reported"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Processed output records:{" "}
                    {report.outputRecords === null
                      ? "Not reported"
                      : formatReportNumber(report.outputRecords)}
                  </p>
                  {report.publicationState && (
                    <p className="mt-1 text-muted-foreground">
                      Publication: {report.publicationState}
                    </p>
                  )}
                </div>
              ))}
              {reports.message && (
                <p className="text-[11px] text-muted-foreground">{reports.message}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {reports.message ?? "No run report can be associated with this job."}
            </p>
          )}
        </section>
      ) : null}

      <ExecutionLogs
        error={logsError}
        jobId={job.job_id}
        loading={detailsLoading}
        stderr={stderr}
        stdout={stdout}
        truncated={logsTruncated}
      />
    </Panel>
  );
}
