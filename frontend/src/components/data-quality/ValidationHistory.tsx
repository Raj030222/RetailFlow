import { History, RefreshCw } from "lucide-react";
import { formatReportNumber, formatTimestamp } from "../../lib/dashboardMetrics";
import { formatJobDuration } from "../../lib/pipelineJobUtils";
import { validationQualityStatus } from "../../lib/validationParser";
import type { ValidationOutput } from "../../types/dataQuality";
import type { JobRecord } from "../../types/jobs";
import { Button } from "../ui/button";
import { EmptyState, ErrorState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";
import { JobStatusBadge } from "../pipeline/JobStatusBadge";
import { ValidationQualityBadge } from "./ValidationQualityBadge";

export function ValidationHistory({
  jobs,
  outputs,
  status,
  error,
  refreshing,
  hasMore,
  loadingMore,
  onRefresh,
  onLoadMore,
  onSelect,
}: {
  jobs: JobRecord[];
  outputs: Record<string, ValidationOutput>;
  status: "loading" | "ready" | "empty" | "error";
  error: string | null;
  refreshing: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onSelect: (job: JobRecord) => void;
}) {
  return (
    <Panel
      action={
        <Button
          aria-label="Refresh validation history"
          disabled={refreshing}
          onClick={onRefresh}
          size="sm"
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      }
      description="Only persisted validation jobs are listed. Execution state and data-quality results are reported separately."
      icon={<History aria-hidden="true" className="h-4 w-4" />}
      title="Validation history"
    >
      {error && (
        <div className="mb-4">
          <ErrorState description={error} />
        </div>
      )}
      {status === "loading" && jobs.length === 0 ? (
        <LoadingState label="Loading validation history" />
      ) : jobs.length === 0 ? (
        <EmptyState
          description={
            hasMore
              ? "No validation jobs were found in this page of job history. Load older jobs to continue searching."
              : "Validation jobs will appear here after they are submitted to the API."
          }
          title={status === "error" ? "Validation history unavailable" : "No validation jobs"}
          action={
            hasMore ? (
              <Button disabled={loadingMore} onClick={onLoadMore} variant="outline">
                {loadingMore ? "Loading older jobs…" : "Load older jobs"}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
            Loaded {jobs.length.toLocaleString()} validation job
            {jobs.length === 1 ? "" : "s"} from persisted job history.
            {hasMore ? " Older jobs are available." : ""}
          </p>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[980px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4">Job ID</th>
                  <th className="pb-3 pr-4">Created at</th>
                  <th className="pb-3 pr-4">Started at</th>
                  <th className="pb-3 pr-4">Completed at</th>
                  <th className="pb-3 pr-4">Execution</th>
                  <th className="pb-3 pr-4">Data quality</th>
                  <th className="pb-3 pr-4">Input records</th>
                  <th className="pb-3 pr-4">Valid records</th>
                  <th className="pb-3 pr-4">Rejected records</th>
                  <th className="pb-3 pr-4">Duration</th>
                  <th className="pb-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const output = outputs[job.job_id];
                  const report = output?.report;
                  return (
                    <tr className="border-b border-border/70 last:border-0" key={job.job_id}>
                      <td className="py-3 pr-4 font-mono text-[11px]" title={job.job_id}>
                        {job.job_id.slice(0, 12)}…
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatTimestamp(job.created_at)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatTimestamp(job.started_at)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatTimestamp(job.completed_at)}
                      </td>
                      <td className="py-3 pr-4"><JobStatusBadge status={job.status} /></td>
                      <td className="py-3 pr-4">
                        <ValidationQualityBadge
                          status={validationQualityStatus(job, output)}
                        />
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatReportNumber(report?.input_records)}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatReportNumber(report?.valid_records)}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatReportNumber(report?.rejected_records)}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{formatJobDuration(job)}</td>
                      <td className="py-3 text-right">
                        <Button
                          aria-label={`Inspect validation job ${job.job_id}`}
                          onClick={() => onSelect(job)}
                          size="sm"
                          variant="outline"
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button disabled={loadingMore || refreshing} onClick={onLoadMore} variant="outline">
                {loadingMore ? "Loading older jobs…" : "Load older validation jobs"}
              </Button>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            The API provides offset-based job pages without a total count. This table includes validation jobs from the pages loaded so far.
          </p>
        </>
      )}
    </Panel>
  );
}
