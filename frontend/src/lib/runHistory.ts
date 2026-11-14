import type { JobRecord, JobType } from "../types/jobs";

const operationLabels: Record<JobType, string> = {
  generate: "Generate",
  validate: "Validate",
  baseline: "Pipeline run · baseline",
  optimized: "Pipeline run · optimized",
  both: "Pipeline run · both modes",
  benchmark: "Benchmark",
};

export function operationLabel(jobType: JobType): string {
  return operationLabels[jobType];
}

export function getJobBatchIds(job: JobRecord): string[] {
  const batchIds = new Set<string>();
  for (const references of Object.values(job.report_references)) {
    for (const reference of references) {
      const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,63}):(?:metrics|reconciliation)$/.exec(
        reference,
      );
      if (match?.[1]) batchIds.add(match[1]);
    }
  }
  return [...batchIds];
}

export function filterHistoryJobs(
  jobs: JobRecord[],
  operation: JobType | "all",
  status: JobRecord["status"] | "all",
  query: string,
): JobRecord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return jobs.filter((job) => {
    if (operation !== "all" && job.job_type !== operation) return false;
    if (status !== "all" && job.status !== status) return false;
    if (!normalizedQuery) return true;
    const searchable = [job.job_id, ...getJobBatchIds(job)]
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  });
}
