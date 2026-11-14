import { Clipboard, RefreshCw, TerminalSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { parseBenchmarkReport, parseValidationLog } from "../../services/dashboardService";
import { getBenchmarkReports } from "../../services/reportsService";
import { formatReportNumber, formatTimestamp } from "../../lib/dashboardMetrics";
import { formatJobDuration } from "../../lib/pipelineJobUtils";
import type { BenchmarkReport, JobRecord, JobType } from "../../types/jobs";
import { Button } from "../ui/button";
import { EmptyState, ErrorState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";
import { JobStatusBadge } from "./JobStatusBadge";

const jobLabels: Record<JobType, string> = {
  generate: "Generate",
  validate: "Validate",
  baseline: "Baseline",
  optimized: "Optimized",
  both: "Both modes",
  benchmark: "Benchmark",
};

function BenchmarkResult({ report }: { report: BenchmarkReport }) {
  const inconclusive =
    report.performance_assessment === "insufficient_repetitions" ||
    report.repetitions < 2;
  const improvement =
    report.equivalent && !inconclusive && report.improvement_percent !== null
      ? `${report.improvement_percent >= 0 ? "+" : ""}${report.improvement_percent.toFixed(1)}%`
      : "Not assessed";
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-4">
      <h3 className="text-sm font-semibold">Benchmark report</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Baseline median</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {report.baseline.median_seconds.toFixed(2)} s
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Optimized median</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {report.optimized.median_seconds.toFixed(2)} s
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Improvement</dt>
          <dd className="mt-1 font-semibold tabular-nums">{improvement}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Equivalence</dt>
          <dd className="mt-1 font-semibold">
            {report.equivalent ? "Outputs equivalent" : "Outputs differ"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Records · repetitions</dt>
          <dd className="mt-1 font-semibold">
            {report.records.toLocaleString()} · {report.repetitions}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Assessment</dt>
          <dd className="mt-1 font-semibold capitalize">
            {report.performance_assessment.replaceAll("_", " ")}
          </dd>
        </div>
      </dl>
      {inconclusive && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          The report indicates insufficient repetitions; no performance improvement is assessed.
        </p>
      )}
      {!report.equivalent && (
        <p className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
          Outputs differ. Durations are shown for context and do not support an improvement claim.
        </p>
      )}
    </div>
  );
}

function ValidationResult({ stdout }: { stdout: string }) {
  const parsed = parseValidationLog(stdout);
  if (!parsed.report) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Validation status is not available in the returned output.
      </p>
    );
  }
  const report = parsed.report;
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-4">
      <p className="text-xs font-semibold">
        Validation result:{" "}
        <span className={report.status === "PASS" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
          {report.status}
        </span>
      </p>
      {"error" in report ? (
        <p className="mt-2 text-xs leading-5 text-destructive">{report.error}</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          {[
            ["Input", report.input_records],
            ["Valid", report.valid_records],
            ["Rejected", report.rejected_records],
            ["Duplicates", report.duplicate_records],
            ["Malformed", report.malformed_records],
          ].map(([label, count]) => (
            <div key={String(label)}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatReportNumber(count)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ExecutionLogs({
  stdout,
  stderr,
  truncated,
  loading,
  error,
}: {
  stdout: string;
  stderr: string;
  truncated: boolean;
  loading: boolean;
  error: string | null;
}) {
  const [stream, setStream] = useState<"stdout" | "stderr">("stdout");
  const activeText = stream === "stdout" ? stdout : stderr;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `STDOUT\n${stdout}\n\nSTDERR\n${stderr}`,
      );
      toast.success("Execution logs copied");
    } catch {
      toast.error("Clipboard access is unavailable in this browser.");
    }
  };
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TerminalSquare aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Execution logs</h3>
        </div>
        <div className="flex items-center gap-2">
          <div aria-label="Log stream" className="flex rounded-md border border-border p-0.5">
            {(["stdout", "stderr"] as const).map((name) => (
              <button
                aria-pressed={stream === name}
                className={`rounded px-2.5 py-1 text-xs capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  stream === name ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                }`}
                key={name}
                onClick={() => setStream(name)}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
          <Button onClick={() => void copy()} size="sm" variant="outline">
            <Clipboard aria-hidden="true" className="h-3.5 w-3.5" />
            Copy logs
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        The API returns separate streams without per-line timestamps. Ordering within each stream is preserved.
      </p>
      {error && <p className="mt-3 text-xs text-destructive" role="alert">{error}</p>}
      {loading ? (
        <LoadingState className="mt-4" label="Loading execution logs" />
      ) : (
        <pre
          aria-label={`${stream} execution log`}
          className="mt-3 max-h-[360px] min-h-28 overflow-auto rounded-md border border-border bg-slate-950 p-4 font-mono text-[11px] leading-5 text-slate-100"
        >
          {activeText || `${stream === "stdout" ? "No standard output" : "No error output"} returned.`}
        </pre>
      )}
      {truncated && (
        <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300" role="status">
          The API indicates that one or more logs were truncated to its configured limit.
        </p>
      )}
    </div>
  );
}

export function JobMonitor({
  jobs,
  status,
  error,
  refreshing,
  lastUpdated,
  refresh,
  hasMore,
  loadMore,
  loadingMore,
  selectedJobId,
  selectJob,
  selectedJob,
  stdout,
  stderr,
  logsTruncated,
  detailsLoading,
  logsError,
}: {
  jobs: JobRecord[];
  status: "loading" | "ready" | "empty" | "error";
  error: string | null;
  refreshing: boolean;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  loadingMore: boolean;
  selectedJobId: string | null;
  selectJob: (jobId: string) => void;
  selectedJob: JobRecord | null;
  stdout: string;
  stderr: string;
  logsTruncated: boolean;
  detailsLoading: boolean;
  logsError: string | null;
}) {
  const [benchmarkReport, setBenchmarkReport] = useState<BenchmarkReport | null>(null);
  const [benchmarkReportState, setBenchmarkReportState] = useState<
    "idle" | "loading" | "ready" | "empty" | "error"
  >("idle");
  const [benchmarkMessage, setBenchmarkMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedJob?.job_type !== "benchmark" || selectedJob.status !== "succeeded") {
      setBenchmarkReport(null);
      setBenchmarkReportState("idle");
      setBenchmarkMessage(null);
      return;
    }
    const controller = new AbortController();
    setBenchmarkReportState("loading");
    getBenchmarkReports(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const report = parseBenchmarkReport(response.json);
        setBenchmarkReport(report);
        setBenchmarkReportState(report ? "ready" : "empty");
        setBenchmarkMessage(
          report ? null : "The benchmark report is not present or has an unsupported structure.",
        );
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        if (
          typeof requestError === "object" &&
          requestError !== null &&
          "statusCode" in requestError &&
          requestError.statusCode === 404
        ) {
          setBenchmarkReportState("empty");
          setBenchmarkMessage("No benchmark report is available for the completed operation.");
        } else {
          setBenchmarkReportState("error");
          setBenchmarkMessage("The benchmark report could not be loaded.");
        }
      });
    return () => controller.abort();
  }, [selectedJob?.job_id, selectedJob?.job_type, selectedJob?.status]);

  return (
    <div className="space-y-5">
      <Panel
        action={
          <Button
            disabled={refreshing}
            onClick={() => void refresh()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
        description="The API executes one operation at a time; submitted work waits in its persistent queue."
        title="Job monitor"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
The API returns at most 100 jobs per request and supports offset-based loading; it does not expose a total count.
          </span>
          <span>
            {lastUpdated
              ? `Updated ${formatTimestamp(lastUpdated.toISOString())}`
              : "Not refreshed yet"}
          </span>
        </div>
        {error && (
          <div className="mb-4">
            <ErrorState description={error} />
          </div>
        )}
        {status === "loading" ? (
          <LoadingState label="Loading persisted jobs" />
        ) : jobs.length === 0 ? (
          <EmptyState
            description="Submitted operations appear here after the API persists them."
            title={status === "error" ? "Job history unavailable" : "No jobs recorded"}
          />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[740px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4">Job ID</th>
                  <th className="pb-3 pr-4">Job type</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Created</th>
                  <th className="pb-3 pr-4">Duration</th>
                  <th className="pb-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    className={`border-b border-border/70 last:border-0 ${
                      selectedJobId === job.job_id ? "bg-accent/40" : ""
                    }`}
                    key={job.job_id}
                  >
                    <td className="py-3 pr-4 font-mono text-[11px]" title={job.job_id}>
                      {job.job_id.slice(0, 12)}…
                    </td>
                    <td className="py-3 pr-4">{jobLabels[job.job_type]}</td>
                    <td className="py-3 pr-4"><JobStatusBadge status={job.status} /></td>
                    <td className="py-3 pr-4 text-muted-foreground">{formatTimestamp(job.created_at)}</td>
                    <td className="py-3 pr-4 tabular-nums">{formatJobDuration(job)}</td>
                    <td className="py-3 text-right">
                      <Button
                        aria-label={`Inspect ${job.job_type} job ${job.job_id}`}
                        onClick={() => selectJob(job.job_id)}
                        size="sm"
                        variant="outline"
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {jobs.length > 0 && hasMore && (
          <div className="mt-4 flex justify-center">
            <Button
              disabled={loadingMore || refreshing}
              onClick={() => void loadMore()}
              variant="outline"
            >
              {loadingMore ? "Loading older jobs…" : "Load older jobs"}
            </Button>
          </div>
        )}
      </Panel>

      <Panel
        icon={<TerminalSquare aria-hidden="true" className="h-4 w-4" />}
        title="Job details and logs"
        description={
          selectedJob
            ? `Selected job ${selectedJob.job_id}`
            : "Select a persisted job to inspect its status and captured output."
        }
      >
        {!selectedJob ? (
          <EmptyState
            description="Job details, errors, and execution logs will appear after selecting a job."
            title="No job selected"
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all font-mono text-xs">{selectedJob.job_id}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {jobLabels[selectedJob.job_type]} · created {formatTimestamp(selectedJob.created_at)}
                </p>
              </div>
              <JobStatusBadge status={selectedJob.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-border py-4 text-xs sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <dt className="text-muted-foreground">Started</dt>
                <dd className="mt-1 font-medium">{formatTimestamp(selectedJob.started_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Completed</dt>
                <dd className="mt-1 font-medium">{formatTimestamp(selectedJob.completed_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="mt-1 font-medium tabular-nums">{formatJobDuration(selectedJob)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Exit code</dt>
                <dd className="mt-1 font-medium tabular-nums">
                  {selectedJob.exit_code === null ? "Not available" : selectedJob.exit_code}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Report references</dt>
                <dd className="mt-1 font-medium">
                  {Object.entries(selectedJob.report_references).some(
                    ([, references]) => references.length > 0,
                  ) ? (
                    <ul className="space-y-1">
                      {Object.entries(selectedJob.report_references)
                        .filter(([, references]) => references.length > 0)
                        .map(([mode, references]) => (
                          <li className="break-all" key={mode}>
                            <span className="text-muted-foreground">{mode}: </span>
                            {references.join(", ")}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    "None"
                  )}
                </dd>
              </div>
            </dl>
            {selectedJob.error_summary && (
              <div className="mt-4">
                <ErrorState
                  title={selectedJob.status === "failed" ? "Job failed" : "Job ended with an issue"}
                  description={selectedJob.error_summary}
                />
              </div>
            )}
            {selectedJob.job_type === "validate" &&
              selectedJob.status !== "queued" &&
              selectedJob.status !== "running" && <ValidationResult stdout={stdout} />}
            {selectedJob.job_type === "benchmark" &&
              selectedJob.status === "succeeded" &&
              (benchmarkReportState === "loading" ? (
                <LoadingState className="mt-4" label="Loading benchmark report" />
              ) : benchmarkReportState === "error" ? (
                <p className="mt-4 text-xs text-destructive" role="alert">
                  {benchmarkMessage}
                </p>
              ) : benchmarkReport ? (
                <BenchmarkResult report={benchmarkReport} />
              ) : (
                benchmarkReportState === "empty" && (
                  <p className="mt-4 text-xs text-muted-foreground" role="status">
                    {benchmarkMessage}
                  </p>
                )
              ))}
            <ExecutionLogs
              error={logsError}
              loading={detailsLoading}
              stderr={stderr}
              stdout={stdout}
              truncated={logsTruncated}
            />
            {selectedJob.status === "queued" || selectedJob.status === "running" ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                Job history and selected-job details are refreshed periodically while work is active.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Terminal status loaded from persisted API job metadata.
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
