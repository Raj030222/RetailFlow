import { CircleCheck, CircleX, Clock3, LoaderCircle } from "lucide-react";
import type { JobStatus } from "../../types/jobs";

const statusStyles: Record<JobStatus, string> = {
  queued: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  running: "bg-blue-500/10 text-blue-800 dark:text-blue-300",
  succeeded: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const statusIcons = {
  queued: Clock3,
  running: LoaderCircle,
  succeeded: CircleCheck,
  failed: CircleX,
  cancelled: CircleX,
} satisfies Record<JobStatus, typeof CircleCheck>;

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const Icon = statusIcons[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyles[status]}`}
    >
      <Icon
        aria-hidden="true"
        className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`}
      />
      {status}
    </span>
  );
}
