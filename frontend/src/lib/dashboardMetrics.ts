import { isPipelineJob } from "../services/jobsService";
import type { JobRecord } from "../types/jobs";
import type { PipelineKpis } from "../types/dashboard";

function elapsedSeconds(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 1000;
}

export function calculatePipelineKpis(
  jobs: JobRecord[],
  historyIsLimited: boolean,
): PipelineKpis {
  const pipelineJobs = jobs.filter(isPipelineJob);
  const latestCompleted = [...pipelineJobs]
    .filter(
      (job) =>
        job.completed_at !== null &&
        !job.error_summary?.includes("state was not verified") &&
        !job.error_summary?.includes("exit status is unknown"),
    )
    .sort(
      (left, right) =>
        Date.parse(right.completed_at ?? "") -
        Date.parse(left.completed_at ?? ""),
    )[0];

  return {
    total: pipelineJobs.length,
    succeeded: pipelineJobs.filter((job) => job.status === "succeeded").length,
    failed: pipelineJobs.filter((job) => job.status === "failed").length,
    queued: pipelineJobs.filter((job) => job.status === "queued").length,
    running: pipelineJobs.filter((job) => job.status === "running").length,
    latestDurationSeconds: latestCompleted
      ? elapsedSeconds(latestCompleted.started_at, latestCompleted.completed_at)
      : null,
    limited: historyIsLimited,
  };
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "Not available";
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatReportNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not reported";
  return new Intl.NumberFormat().format(value);
}

export function formatSeconds(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "Not reported";
  }
  return `${value.toFixed(2)} s`;
}
