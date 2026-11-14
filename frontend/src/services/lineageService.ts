import { getRunReports } from "./reportsService";
import {
  associateRunReport,
  getRunBatchReferences,
} from "../lib/dataLineage";
import type { JobRecord } from "../types/jobs";
import type {
  AssociatedRunReport,
  RunReportState,
} from "../types/lineage";

export interface AssociatedRunReportResult {
  reports: AssociatedRunReport[];
  state: RunReportState;
  message: string | null;
}

export async function loadAssociatedRunReports(
  job: JobRecord,
  signal?: AbortSignal,
): Promise<AssociatedRunReportResult> {
  const batchReferences = getRunBatchReferences(job);
  const targets = Object.entries(batchReferences).filter(
    (entry): entry is ["baseline" | "optimized", string] =>
      typeof entry[1] === "string",
  );
  if (targets.length === 0) {
    return {
      reports: [],
      state: "unavailable",
      message: "This job does not expose a batch report reference.",
    };
  }
  if (!job.completed_at) {
    return {
      reports: [],
      state: "unavailable",
      message: "Run-specific reports can be matched after this job completes.",
    };
  }

  const results = await Promise.allSettled(
    targets.map(async ([mode, batchId]) => {
      const response = await getRunReports(
        batchId,
        job.job_type === "both" ? undefined : mode,
        signal,
      );
      if (response.batch_id !== batchId) return null;
      const report = response.reports[mode] ?? response.reports.default;
      return associateRunReport(job, batchId, mode, report);
    }),
  );
  if (signal?.aborted) {
    return { reports: [], state: "unavailable", message: null };
  }

  const associatedReports = results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
  const rejectedCount = results.filter(
    (result) => result.status === "rejected",
  ).length;
  if (associatedReports.length > 0) {
    return {
      reports: associatedReports,
      state: "available",
      message:
        rejectedCount > 0
          ? "Some referenced mode reports could not be loaded."
          : null,
    };
  }
  if (rejectedCount === results.length) {
    return {
      reports: [],
      state: "unavailable",
      message: "No run report could be loaded for the selected batch.",
    };
  }
  return {
    reports: [],
    state: "unmatched",
    message:
      "A report exists for the referenced batch, but its mode and timestamps do not verify that it belongs to this job.",
  };
}
