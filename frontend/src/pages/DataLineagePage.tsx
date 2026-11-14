import { GitBranch, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LineageGraph } from "../components/lineage/LineageGraph";
import { LineageNodeDetails } from "../components/lineage/LineageNodeDetails";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { EmptyState, ErrorState, LoadingState } from "../components/common/States";
import { Button } from "../components/ui/button";
import { useDataLineage } from "../hooks/useDataLineage";
import { LINEAGE_NODES } from "../lib/dataLineage";
import { jobOperationLabel } from "../services/jobsService";
import type { LineageNode } from "../types/lineage";
import type { JobRecord } from "../types/jobs";

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "Unavailable";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

function statusStyle(status: JobRecord["status"]): string {
  if (status === "succeeded") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "failed") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (status === "running") {
    return "border-primary/30 bg-primary/10 text-primary";
  }
  return "border-border bg-muted text-muted-foreground";
}

function MetricCard({
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
      <p className="mt-2 break-words text-lg font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div
      aria-label="Loading lineage summary"
      className="animate-pulse rounded-lg border border-border bg-card p-4"
      role="status"
    >
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="mt-3 h-6 w-28 rounded bg-muted" />
      <div className="mt-2 h-3 w-32 rounded bg-muted" />
    </div>
  );
}

function RunSelection({
  jobs,
  selectedJobId,
  status,
  error,
  refreshing,
  loadingMore,
  hasMore,
  onSelect,
  requestedJobId,
  onRefresh,
  onLoadMore,
}: {
  jobs: JobRecord[];
  selectedJobId: string | null;
  status: "loading" | "ready" | "empty" | "error";
  error: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onSelect: (jobId: string) => void;
  requestedJobId: string | null;
  onRefresh: () => void;
  onLoadMore: () => void;
}) {
  return (
    <Panel
      description="Only baseline, optimized, and combined pipeline jobs are selectable. The job ID and job execution state come from persisted job history."
      icon={<GitBranch aria-hidden="true" className="h-4 w-4" />}
      title="Pipeline run"
      action={
        <Button
          aria-label="Refresh pipeline runs"
          disabled={refreshing}
          onClick={onRefresh}
          size="icon"
          title="Refresh pipeline runs"
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      }
    >
      {status === "loading" && (
        <LoadingState label="Loading pipeline history…" />
      )}
      {error && (
        <ErrorState
          description={error}
          title="Pipeline history unavailable"
        />
      )}
      {status === "empty" && !error && (
        <EmptyState
          description="The API has no persisted baseline, optimized, or combined pipeline jobs. The static pipeline structure remains available below."
          title="No pipeline runs"
        />
      )}
      {jobs.length > 0 && (
        <div className="space-y-4">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="lineage-run-select">
            Select a pipeline run
          </label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="lineage-run-select"
            onChange={(event) => onSelect(event.target.value)}
            value={selectedJobId ?? ""}
          >
            {requestedJobId && !jobs.some((job) => job.job_id === requestedJobId) && (
              <option value={requestedJobId}>
                Selected from Run History · {requestedJobId}
              </option>
            )}
            {jobs.map((job) => (
              <option key={job.job_id} value={job.job_id}>
                {job.job_id} · {jobOperationLabel(job.job_type)} · {job.status}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Showing {jobs.length} persisted pipeline run{jobs.length === 1 ? "" : "s"}.</span>
            {hasMore && (
              <Button
                disabled={loadingMore}
                onClick={onLoadMore}
                size="sm"
                variant="outline"
              >
                {loadingMore ? "Loading…" : "Load older runs"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function DataLineagePage() {
  const lineage = useDataLineage();
  const { selectJob } = lineage;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedJobId = searchParams.get("jobId");
  const [selectedNode, setSelectedNode] = useState<LineageNode>(
    LINEAGE_NODES[0]!,
  );
  useEffect(() => {
    if (requestedJobId) selectJob(requestedJobId);
  }, [requestedJobId, selectJob]);
  const selectRun = (jobId: string) => {
    selectJob(jobId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (jobId) next.set("jobId", jobId);
      else next.delete("jobId");
      return next;
    }, { replace: true });
  };
  const selectedJob = lineage.selectedJob;
  const lastUpdated = formatDate(lineage.lastUpdated);
  const selectedRun = selectedJob?.job_id ?? "No run selected";
  const selectedStatus = selectedJob?.status ?? "Unavailable";
  const jobType = selectedJob ? jobOperationLabel(selectedJob.job_type) : null;
  const sourceCount = LINEAGE_NODES.filter((node) => node.kind === "source").length;
  const transformationCount = LINEAGE_NODES.filter(
    (node) => node.stageType === "transformation",
  ).length;
  const outputCount = LINEAGE_NODES.filter((node) => node.kind === "output").length;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              History updated {lastUpdated}
            </span>
          </div>
        }
        description="Trace the configured CSV sources through validation and baseline or optimized processing to published Parquet datasets."
        eyebrow="Data observability"
        title="Data Lineage"
      />

      <section
        aria-label="Lineage overview"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
      >
        {lineage.status === "loading" && !lineage.lastUpdated ? (
          Array.from({ length: 6 }, (_, index) => <MetricSkeleton key={index} />)
        ) : (
          <>
            <MetricCard
              detail="CSV sources in the current pipeline"
              label="Source datasets"
              value={String(sourceCount)}
            />
            <MetricCard
              detail="Baseline and optimized implementations"
              label="Transformation stages"
              value={String(transformationCount)}
            />
            <MetricCard
              detail="Analytical and classified outputs"
              label="Output datasets"
              value={String(outputCount)}
            />
            <MetricCard
              detail={jobType ?? "Select a persisted run below"}
              label="Selected pipeline run"
              value={selectedRun}
            />
            <MetricCard
              detail="From persisted job history"
              label="Execution status"
              value={selectedStatus}
            />
            <MetricCard
              detail="Pipeline run history refresh"
              label="Last updated"
              value={lastUpdated}
            />
          </>
        )}
      </section>

      <RunSelection
        error={lineage.error}
        hasMore={lineage.hasMore}
        jobs={lineage.jobs}
        loadingMore={lineage.loadingMore}
        onLoadMore={() => void lineage.loadMore()}
        onRefresh={() => void lineage.refresh()}
        onSelect={selectRun}
        refreshing={lineage.refreshing}
        requestedJobId={requestedJobId}
        selectedJobId={lineage.selectedJobId}
        status={lineage.status}
      />

      {selectedJob && (
        <Panel
          description="Job history status is authoritative for this execution. Report fields below are shown as run-specific only when their batch, mode, and report timestamps fit within this job’s recorded execution window."
          title="Selected run execution"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Job ID</p>
              <p className="mt-1 break-all font-mono text-xs">{selectedJob.job_id}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Operation</p>
              <p className="mt-1 text-sm">{jobOperationLabel(selectedJob.job_type)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Execution status</p>
              <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle(selectedJob.status)}`}>
                {selectedJob.status}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Completed</p>
              <p className="mt-1 text-sm">{formatDate(selectedJob.completed_at)}</p>
            </div>
          </div>
          {lineage.detailsLoading && (
            <LoadingState className="mt-4" label="Loading selected run details…" />
          )}
          {lineage.detailsError && (
            <p className="mt-4 text-xs text-muted-foreground">{lineage.detailsError}</p>
          )}
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium">Run report metadata</p>
            {lineage.runReportState === "available" ? (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {lineage.runReports.map((report) => (
                  <p key={`${report.mode}-${report.batchId}`}>
                    {report.mode} · batch {report.batchId} · run ID {report.runId ?? "unavailable"} · pipeline {report.pipelineStatus ?? "not reported"}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {lineage.runReportMessage ??
                  (lineage.runReportState === "loading"
                    ? "Checking persisted reports…"
                    : "Run-specific report metadata is unavailable.")}
              </p>
            )}
          </div>
          {lineage.logs && (
            <details className="mt-4 rounded-md border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                Execution logs{lineage.logs.truncated ? " (truncated)" : ""}
              </summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">
                {[lineage.logs.stdout, lineage.logs.stderr]
                  .filter(Boolean)
                  .join("\n") || "No execution log output was captured."}
              </pre>
            </details>
          )}
          {lineage.logsError && (
            <p className="mt-3 text-xs text-muted-foreground">{lineage.logsError}</p>
          )}
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          action={
            <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
              Code-derived
            </span>
          }
          description="Current pipeline structure derived from the checked-in ingestion, validation, transformation, and publication code. It is not proof that any selected run completed a stage."
          title="Static pipeline structure"
        >
          <LineageGraph
            onSelectNode={setSelectedNode}
            selectedNodeId={selectedNode.id}
          />
        </Panel>
        <Panel title="Node details">
          <LineageNodeDetails
            node={selectedNode}
            reportMessage={lineage.runReportMessage}
            reportState={lineage.runReportState}
            reports={lineage.runReports}
            selectedJob={selectedJob}
          />
        </Panel>
      </div>

      <Panel
        description="The dashboard separates source-code lineage from facts recorded for a particular execution."
        title="Metadata coverage and limitations"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold">Available from this project</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Input names, configured input paths, explicit CSV columns, transformation descriptions, output names and formats come from the current repository. Job ID, status, timestamps, logs, report references, and any associated run metrics come from the existing API.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold">Not currently exposed per dataset</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Source row counts, output schemas and per-output row counts, stage-level status/duration, and a direct job-ID-to-run-ID link are unavailable. Summary record counts are not copied onto every output. A batch report is not treated as this job’s report unless its mode and timestamps match the job window.
            </p>
          </div>
        </div>
        <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          Smallest future backend enhancement: expose a run manifest keyed by job ID with the run ID, mode, input file metadata, per-output path/schema/row count, and stage outcomes. Until then, this page keeps stage status and unsupported counts unavailable.
        </p>
      </Panel>
    </div>
  );
}
