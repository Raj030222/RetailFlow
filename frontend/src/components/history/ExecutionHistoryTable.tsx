import { Clipboard } from "lucide-react";
import { toast } from "sonner";
import { formatTimestamp } from "../../lib/dashboardMetrics";
import { formatJobDuration } from "../../lib/pipelineJobUtils";
import { getJobBatchIds, operationLabel } from "../../lib/runHistory";
import type { JobRecord } from "../../types/jobs";
import { Button } from "../ui/button";
import { EmptyState } from "../common/States";
import { JobStatusBadge } from "../pipeline/JobStatusBadge";

function timestamp(value: string | null): string {
  const formatted = formatTimestamp(value);
  return formatted === "—" ? "Not available" : formatted;
}

async function copyJobId(jobId: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard access is unavailable.");
    }
    await navigator.clipboard.writeText(jobId);
    toast.success("Job ID copied");
  } catch {
    toast.error("Clipboard access is unavailable in this browser.");
  }
}

export function ExecutionHistoryTable({
  jobs,
  selectedJobId,
  onSelect,
}: {
  jobs: JobRecord[];
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
}) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        description="No execution in the loaded history matches the current filters."
        title="No matching executions"
      />
    );
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[1060px] border-collapse text-left text-xs">
        <caption className="sr-only">
          Persisted RetailFlow executions in the currently loaded history
        </caption>
        <thead>
          <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-3 pr-4">Job ID</th>
            <th className="pb-3 pr-4">Operation</th>
            <th className="pb-3 pr-4">Status</th>
            <th className="pb-3 pr-4">Created at</th>
            <th className="pb-3 pr-4">Started at</th>
            <th className="pb-3 pr-4">Completed at</th>
            <th className="pb-3 pr-4">Duration</th>
            <th className="pb-3 pr-4">Batch ID</th>
            <th className="pb-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const batchIds = getJobBatchIds(job);
            const selected = selectedJobId === job.job_id;
            return (
              <tr
                aria-selected={selected}
                className={`cursor-pointer border-b border-border/70 last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected ? "bg-accent/50" : "hover:bg-muted/40"
                }`}
                key={job.job_id}
                onClick={() => onSelect(job.job_id)}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    onSelect(job.job_id);
                  }
                }}
                tabIndex={0}
                title={`Inspect job ${job.job_id}`}
              >
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono text-[11px]" title={job.job_id}>
                      {job.job_id.slice(0, 12)}…
                    </span>
                    <Button
                      aria-label={`Copy job ID ${job.job_id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void copyJobId(job.job_id);
                      }}
                      size="icon"
                      title="Copy full job ID"
                      variant="ghost"
                    >
                      <Clipboard aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </td>
                <td className="py-3 pr-4">{operationLabel(job.job_type)}</td>
                <td className="py-3 pr-4"><JobStatusBadge status={job.status} /></td>
                <td className="py-3 pr-4 text-muted-foreground" title={job.created_at}>
                  {timestamp(job.created_at)}
                </td>
                <td className="py-3 pr-4 text-muted-foreground" title={job.started_at ?? undefined}>
                  {timestamp(job.started_at)}
                </td>
                <td className="py-3 pr-4 text-muted-foreground" title={job.completed_at ?? undefined}>
                  {timestamp(job.completed_at)}
                </td>
                <td className="py-3 pr-4 tabular-nums">
                  {formatJobDuration(job)}
                </td>
                <td className="py-3 pr-4 font-mono text-[11px]">
                  {batchIds.length > 0 ? batchIds.join(", ") : "Not available"}
                </td>
                <td className="py-3 text-right">
                  <Button
                    aria-label={`Inspect ${job.job_type} job ${job.job_id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(job.job_id);
                    }}
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
  );
}
