import { ArrowUpRight } from "lucide-react";
import { formatTimestamp } from "../../lib/dashboardMetrics";
import { formatJobDuration } from "../../lib/pipelineJobUtils";
import type { JobRecord, JobSubmission } from "../../types/jobs";
import { Button } from "../ui/button";
import { JobStatusBadge } from "./JobStatusBadge";

export function OperationJobSummary({
  job,
  submission,
  onInspect,
}: {
  job?: JobRecord;
  submission?: JobSubmission;
  onInspect: (jobId: string) => void;
}) {
  const currentJob =
    job && (!submission || submission.job_id === job.job_id) ? job : undefined;
  const currentSubmission = currentJob ? undefined : submission;
  const jobId = currentJob?.job_id ?? currentSubmission?.job_id ?? job?.job_id;
  const status = currentJob?.status ?? currentSubmission?.status ?? job?.status;
  if (!jobId || !status) return null;

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground" title={jobId}>
          {jobId}
        </span>
        <JobStatusBadge status={status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd className="mt-0.5">{formatTimestamp(currentJob?.created_at ?? currentSubmission?.created_at ?? job?.created_at ?? null)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="mt-0.5">{currentJob ? formatJobDuration(currentJob) : "Queued"}</dd>
        </div>
      </dl>
      {currentJob?.started_at && (
        <p className="mt-2 text-xs text-muted-foreground">
          Started {formatTimestamp(currentJob.started_at)}
          {currentJob.completed_at ? ` · Completed ${formatTimestamp(currentJob.completed_at)}` : ""}
        </p>
      )}
      {currentJob?.error_summary && (
        <p className="mt-2 break-words text-xs text-destructive">{currentJob.error_summary}</p>
      )}
      <Button
        className="mt-3"
        onClick={() => onInspect(jobId)}
        size="sm"
        variant="outline"
      >
        Inspect job
        <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
