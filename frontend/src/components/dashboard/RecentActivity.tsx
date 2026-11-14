import { ArrowRight, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDuration, formatTimestamp } from "../../lib/dashboardMetrics";
import type { JobWidgetData } from "../../types/dashboard";
import type { JobRecord } from "../../types/jobs";
import { jobOperationLabel } from "../../services/jobsService";
import { Button } from "../ui/button";
import { EmptyState, ErrorState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";
import { JobStatusBadge } from "../pipeline/JobStatusBadge";

function jobDuration(job: JobRecord): number | null {
  if (!job.started_at || !job.completed_at) return null;
  if (
    job.error_summary?.includes("state was not verified") ||
    job.error_summary?.includes("exit status is unknown")
  ) {
    return null;
  }
  const duration =
    (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function RecentActivity({ data }: { data: JobWidgetData }) {
  if (data.status === "loading") {
    return (
      <Panel title="Recent pipeline activity">
        <LoadingState label="Loading job history" />
      </Panel>
    );
  }
  if (data.status === "error" && data.jobs.length === 0) {
    return (
      <Panel title="Recent pipeline activity">
        <ErrorState description={data.message ?? "Job history could not be loaded."} />
      </Panel>
    );
  }
  if (data.jobs.length === 0) {
    return (
      <Panel title="Recent pipeline activity">
        <EmptyState
          description="Submitted operations will appear here when the API has job history."
          title="No jobs recorded"
        />
      </Panel>
    );
  }

  return (
    <Panel
      action={
        <Button asChild size="sm" variant="ghost">
          <Link to="/history">
            Run history
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </Button>
      }
      description={data.message ?? "Latest jobs returned by the local API."}
      title="Recent pipeline activity"
    >
      {data.status === "error" && (
        <p className="mb-3 text-xs text-amber-700 dark:text-amber-300" role="status">
          Showing the last available job data. Latest refresh failed.
        </p>
      )}
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="pb-3 pr-4">Job ID</th>
              <th className="pb-3 pr-4">Operation</th>
              <th className="pb-3 pr-4">Pipeline mode</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">Submitted</th>
              <th className="pb-3 pr-4">Started / completed</th>
              <th className="pb-3 text-right">Duration</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.slice(0, 6).map((job) => (
              <tr className="border-b border-border/70 last:border-0" key={job.job_id}>
                <td className="py-3 pr-4 font-mono text-[11px] text-muted-foreground">
                  {job.job_id.slice(0, 12)}
                </td>
                <td className="py-3 pr-4 font-medium">{jobOperationLabel(job.job_type)}</td>
                <td className="py-3 pr-4 capitalize text-muted-foreground">
                  {["baseline", "optimized", "both"].includes(job.job_type)
                    ? job.job_type
                    : "—"}
                </td>
                <td className="py-3 pr-4"><JobStatusBadge status={job.status} /></td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {formatTimestamp(job.created_at)}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  <div className="space-y-1">
                    <span className="flex items-center gap-1">
                      <Clock3 aria-hidden="true" className="h-3 w-3" />
                      {job.started_at
                        ? `Started ${formatTimestamp(job.started_at)}`
                        : "Not started"}
                    </span>
                    <span className="block pl-4">
                      {job.completed_at
                        ? `Completed ${formatTimestamp(job.completed_at)}`
                        : "Not completed"}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-right tabular-nums">
                  {formatDuration(jobDuration(job))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link to="/history">View run history</Link>
        </Button>
      </div>
    </Panel>
  );
}
