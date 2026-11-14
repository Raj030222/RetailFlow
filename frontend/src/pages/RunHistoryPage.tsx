import { Activity, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExecutionDetails } from "../components/history/ExecutionDetails";
import { ExecutionHistoryTable } from "../components/history/ExecutionHistoryTable";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { EmptyState, ErrorState, LoadingState } from "../components/common/States";
import { Button } from "../components/ui/button";
import { usePipelineJobs } from "../hooks/usePipelineJobs";
import { filterHistoryJobs } from "../lib/runHistory";
import { formatTimestamp } from "../lib/dashboardMetrics";
import { loadAssociatedRunReports } from "../services/lineageService";
import type { AssociatedRunReportResult } from "../services/lineageService";
import type { JobStatus, JobType } from "../types/jobs";

type OperationFilter = JobType | "all";
type StatusFilter = JobStatus | "all";

const EMPTY_REPORTS: AssociatedRunReportResult = {
  reports: [],
  state: "not-applicable",
  message: null,
};

const STATUS_ORDER: JobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold tracking-tight" title={value}>
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function LoadSkeleton() {
  return (
    <div
      aria-label="Loading run history"
      className="animate-pulse rounded-lg border border-border bg-card p-5"
      role="status"
    >
      <div className="h-4 w-40 rounded bg-muted" />
      <div className="mt-5 h-10 rounded bg-muted" />
      <div className="mt-3 h-10 rounded bg-muted" />
    </div>
  );
}

export function RunHistoryPage() {
  const history = usePipelineJobs();
  const { selectJob: selectHistoryJob } = history;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedJobId = searchParams.get("jobId");
  const [operation, setOperation] = useState<OperationFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [reports, setReports] =
    useState<AssociatedRunReportResult>(EMPTY_REPORTS);

  const selectedJob = history.selectedJob;
  useEffect(() => {
    if (requestedJobId) selectHistoryJob(requestedJobId);
  }, [requestedJobId, selectHistoryJob]);
  const selectJob = useCallback(
    (jobId: string) => {
      selectHistoryJob(jobId);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (jobId) next.set("jobId", jobId);
        else next.delete("jobId");
        return next;
      }, { replace: true });
    },
    [selectHistoryJob, setSearchParams],
  );
  const visibleJobs = useMemo(
    () => filterHistoryJobs(history.jobs, operation, statusFilter, query),
    [history.jobs, operation, query, statusFilter],
  );
  const operationOptions = useMemo(
    () => [...new Set(history.jobs.map((job) => job.job_type))],
    [history.jobs],
  );
  const statusOptions = useMemo(
    () => STATUS_ORDER.filter((status) => history.jobs.some((job) => job.status === status)),
    [history.jobs],
  );
  const activeCount = history.jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  ).length;
  const failedCount = history.jobs.filter((job) => job.status === "failed").length;
  const succeededCount = history.jobs.filter((job) => job.status === "succeeded").length;

  useEffect(() => {
    if (
      !selectedJob ||
      !["baseline", "optimized", "both"].includes(selectedJob.job_type) ||
      selectedJob.status === "queued" ||
      selectedJob.status === "running"
    ) {
      setReports(EMPTY_REPORTS);
      return;
    }

    const controller = new AbortController();
    setReports({
      reports: [],
      state: "loading",
      message: null,
    });
    void loadAssociatedRunReports(selectedJob, controller.signal).then((result) => {
      if (!controller.signal.aborted) setReports(result);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setReports({
          reports: [],
          state: "unavailable",
          message: "Referenced run reports could not be loaded.",
        });
      }
    });
    return () => controller.abort();
  }, [selectedJob]);

  const lastUpdated = formatTimestamp(
    history.lastUpdated?.toISOString() ?? null,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Updated {lastUpdated}
            </span>
            <Button
              disabled={history.refreshing}
              onClick={() => void history.refresh()}
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${history.refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        }
        description="Review persisted executions, compare their outcomes, and inspect run-specific logs and verified reports."
        eyebrow="Operations"
        title="Run History"
      />

      <section
        aria-label="Loaded execution summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {history.status === "loading" && history.jobs.length === 0 ? (
          Array.from({ length: 4 }, (_, index) => (
            <div
              aria-label="Loading execution summary"
              className="animate-pulse rounded-lg border border-border bg-card p-4"
              key={index}
              role="status"
            >
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="mt-3 h-6 w-20 rounded bg-muted" />
            </div>
          ))
        ) : (
          <>
            <SummaryCard
              detail="Loaded from the API; total history is not exposed"
              label="Loaded executions"
              value={history.jobs.length.toLocaleString()}
            />
            <SummaryCard
              detail="Queued or running in loaded records"
              label="Active"
              value={activeCount.toLocaleString()}
            />
            <SummaryCard
              detail="Successful in loaded records"
              label="Succeeded"
              value={succeededCount.toLocaleString()}
            />
            <SummaryCard
              detail="Failed in loaded records"
              label="Failed"
              value={failedCount.toLocaleString()}
            />
          </>
        )}
      </section>

      {history.error && (
        <ErrorState
          description={history.error}
          title="Execution history could not be fully loaded"
        />
      )}

      <Panel
        description="Filters and summary counts apply only to records loaded from the API. Search covers job IDs and batch IDs present in report references."
        title="Filter loaded history"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_minmax(240px,2fr)_auto]">
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Operation
            <select
              aria-label="Filter by operation"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setOperation(event.target.value as OperationFilter)}
              value={operation}
            >
              <option value="all">All loaded operations</option>
              {operationOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "baseline" || item === "optimized" || item === "both"
                    ? `Pipeline · ${item}`
                    : item.charAt(0).toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Status
            <select
              aria-label="Filter by status"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              value={statusFilter}
            >
              <option value="all">All loaded statuses</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Search job ID or batch ID
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                aria-label="Search job or batch ID"
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search loaded jobs…"
                type="search"
                value={query}
              />
            </span>
          </label>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!query && operation === "all" && statusFilter === "all"}
              onClick={() => {
                setQuery("");
                setOperation("all");
                setStatusFilter("all");
              }}
              variant="outline"
            >
              Clear filters
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        description={`Showing ${visibleJobs.length.toLocaleString()} of ${history.jobs.length.toLocaleString()} loaded execution${history.jobs.length === 1 ? "" : "s"}. The jobs API does not expose a total history count.`}
        title="Persisted executions"
      >
        {history.status === "loading" && history.jobs.length === 0 ? (
          <LoadSkeleton />
        ) : history.jobs.length === 0 && !history.error ? (
          <EmptyState
            description="No execution records are currently persisted by the API. Submit an operation from Pipeline Execution and return here to inspect it."
            title="No run history"
          />
        ) : history.jobs.length === 0 ? (
          <EmptyState
            description="The job history could not be loaded. Check the API connection and try refreshing."
            title="Run history unavailable"
          />
        ) : (
          <ExecutionHistoryTable
            jobs={visibleJobs}
            onSelect={selectJob}
            selectedJobId={history.selectedJobId}
          />
        )}
        {history.hasMore && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-[11px] text-muted-foreground">
              Older records are fetched in offset-based pages of up to 100. Filters and search cover loaded records only.
            </p>
            <Button
              disabled={history.loadingMore}
              onClick={() => void history.loadMore()}
              variant="outline"
            >
              {history.loadingMore ? (
                <LoadingState label="Loading older executions…" />
              ) : (
                <>
                  <Activity aria-hidden="true" className="h-3.5 w-3.5" />
                  Load older executions
                </>
              )}
            </Button>
          </div>
        )}
      </Panel>

      <ExecutionDetails
        detailsError={history.detailsError}
        detailsLoading={history.detailsLoading}
        job={selectedJob}
        key={history.selectedJobId ?? "no-selected-job"}
        logsError={history.logsError}
        logsTruncated={history.logsTruncated}
        reports={reports}
        selectedJobId={history.selectedJobId}
        stderr={history.stderr}
        stdout={history.stdout}
      />

      <p className="text-[11px] leading-5 text-muted-foreground">
        The API persists job status, timing, exit code, error summary, report references, and bounded standard output/error. It does not expose submission parameters or a total history count. Benchmark reports lack a historical job association, so they are not attributed to past benchmark jobs.
      </p>
    </div>
  );
}
