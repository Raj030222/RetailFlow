import type { JobRecord } from "../types/jobs";

export function formatJobDuration(
  job: Pick<JobRecord, "started_at" | "completed_at" | "status" | "error_summary">,
): string {
  if (
    job.error_summary?.includes("not verified") ||
    job.error_summary?.includes("exit status is unknown")
  ) {
    return "Not available";
  }
  if (!job.started_at) return "Not available";
  const start = Date.parse(job.started_at);
  const end = job.completed_at ? Date.parse(job.completed_at) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "Not available";
  }
  const seconds = (end - start) / 1000;
  if (!job.completed_at && job.status !== "running") return "Not available";
  if (seconds < 60) return `${seconds.toFixed(1)} s${job.completed_at ? "" : " elapsed"}`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}m ${remainder}s${job.completed_at ? "" : " elapsed"}`;
}

export function submissionFingerprint(
  operation: string,
  payload: Record<string, string | number | boolean>,
): string {
  return `${operation}:${JSON.stringify(
    Object.fromEntries(Object.entries(payload).sort(([left], [right]) => left.localeCompare(right))),
  )}`;
}
