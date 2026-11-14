import { ShieldCheck } from "lucide-react";
import type { ValidationOutput, ValidationQualityStatus } from "../../types/dataQuality";
import type { JobRecord } from "../../types/jobs";
import { formatTimestamp } from "../../lib/dashboardMetrics";
import { Panel } from "../common/Panel";
import { EmptyState, LoadingState } from "../common/States";
import { JobStatusBadge } from "../pipeline/JobStatusBadge";
import { ValidationQualityBadge } from "./ValidationQualityBadge";

function statusExplanation(
  job: JobRecord | null,
  status: ValidationQualityStatus,
  output: ValidationOutput | undefined,
): string {
  if (!job) return "No validation job is available in the loaded history.";
  if (status === "RUNNING") {
    return `The job is ${job.status}; its data-quality result is not available until it completes.`;
  }
  if (status === "PASS" && job.status !== "succeeded") {
    return "The returned validation report says PASS, but the job execution did not succeed.";
  }
  if (status === "PASS" || status === "FAIL") {
    return job.status === "succeeded"
      ? `Job execution succeeded. The validation report independently returned ${status}.`
      : `Job execution is ${job.status}. The validation report independently returned ${status}.`;
  }
  if (status === "LOADING") return "The completed job's validation output is being retrieved.";
  if (status === "ERROR") {
    return output?.message ?? "The validation output could not be interpreted.";
  }
  return job.status === "succeeded"
    ? "The job completed, but it returned no validation report."
    : "The job did not produce a validation report.";
}

export function ValidationStatusCard({
  job,
  output,
  status,
  hasMore,
}: {
  job: JobRecord | null;
  output: ValidationOutput | undefined;
  status: ValidationQualityStatus;
  hasMore: boolean;
}) {
  return (
    <Panel
      action={<ValidationQualityBadge status={status} />}
      description="Validation quality and process execution are separate outcomes."
      icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
      title="Validation status"
    >
      {!job && status === "LOADING" ? (
        <LoadingState label="Loading the latest validation status" />
      ) : !job ? (
        <EmptyState
          description={
            hasMore
              ? "No validation job is present in the newest loaded page. Load older jobs to inspect previous validations."
              : "Run a validation to check the configured input datasets."
          }
          title="No validation result selected"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Job execution</p>
              <div className="mt-1.5"><JobStatusBadge status={job.status} /></div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Created {formatTimestamp(job.created_at)}</p>
              <p className="mt-1">
                Completed {formatTimestamp(job.completed_at)}
              </p>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground" role="status">
            {statusExplanation(job, status, output)}
          </p>
          {job.error_summary && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-destructive">
              {job.error_summary}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
