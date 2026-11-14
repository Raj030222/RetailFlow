import { getJobLogs, listJobs } from "./jobsService";
import { parseValidationOutput } from "../lib/validationParser";
import type { ValidationJobPage, ValidationOutput } from "../types/dataQuality";
import type { JobRecord } from "../types/jobs";

export const VALIDATION_HISTORY_PAGE_SIZE = 50;

export async function fetchValidationJobs(
  offset: number,
  signal?: AbortSignal,
): Promise<ValidationJobPage> {
  const page = await listJobs(VALIDATION_HISTORY_PAGE_SIZE, offset, signal);
  return {
    jobs: page.filter((job) => job.job_type === "validate"),
    scanned: page.length,
    hasMore: page.length === VALIDATION_HISTORY_PAGE_SIZE,
  };
}

export async function fetchValidationOutput(
  job: JobRecord,
  signal?: AbortSignal,
): Promise<ValidationOutput> {
  const logs = await getJobLogs(job.job_id, signal);
  const parsed = parseValidationOutput(logs.stdout);
  return {
    ...logs,
    ...parsed,
  };
}
