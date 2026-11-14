import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchValidationOutput } from "../services/dataQualityService";
import { getJob, listJobs } from "../services/jobsService";
import { getBenchmarkReports, getRunReports } from "../services/reportsService";
import { ApiRequestError } from "../services/apiClient";
import { buildReportCatalog } from "../lib/reportCatalog";
import { getRunBatchReferences } from "../lib/dataLineage";
import type {
  BenchmarkReportLookup,
  RunReportLookup,
  ValidationOutputLookup,
} from "../lib/reportCatalog";
import type { JobRecord } from "../types/jobs";

const PAGE_SIZE = 100;
const LOOKUP_CONCURRENCY = 4;

type LoadStatus = "loading" | "ready" | "empty" | "error";
type SelectedJobState =
  | { status: "idle" }
  | { status: "loading"; jobId: string }
  | { status: "ready"; job: JobRecord }
  | { status: "error"; jobId: string; message: string };

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.statusCode === 404;
}

function referencedBatchIds(jobs: JobRecord[]): string[] {
  return [
    ...new Set(
      jobs.flatMap((job) => Object.values(getRunBatchReferences(job))),
    ),
  ];
}

export function useReportsCatalog() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [runLookups, setRunLookups] = useState<Map<string, RunReportLookup>>(
    new Map(),
  );
  const [benchmarkLookup, setBenchmarkLookup] =
    useState<BenchmarkReportLookup>({ state: "loading" });
  const [validationOutputs, setValidationOutputs] = useState<
    Map<string, ValidationOutputLookup>
  >(new Map());
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [selectedJob, setSelectedJob] = useState<SelectedJobState>({
    status: "idle",
  });
  const jobsRef = useRef(jobs);
  const runLookupsRef = useRef(runLookups);
  const validationOutputsRef = useRef(validationOutputs);
  const listController = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const selectionController = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const hasLoadedRef = useRef(false);

  jobsRef.current = jobs;
  runLookupsRef.current = runLookups;
  validationOutputsRef.current = validationOutputs;

  const loadRunReports = useCallback(
    async (
      targets: string[],
      signal: AbortSignal,
      isCurrent: () => boolean,
    ) => {
      const newTargets = targets.filter(
        (batchId) => !runLookupsRef.current.has(batchId),
      );
      if (newTargets.length === 0) return;

      setRunLookups((current) => {
        const next = new Map(current);
        for (const batchId of newTargets) next.set(batchId, { state: "loading" });
        runLookupsRef.current = next;
        return next;
      });

      let cursor = 0;
      const worker = async () => {
        while (cursor < newTargets.length && !signal.aborted) {
          const batchId = newTargets[cursor];
          cursor += 1;
          if (!batchId) continue;
          let result: RunReportLookup;
          try {
            const response = await getRunReports(batchId, undefined, signal);
            result =
              response.batch_id === batchId
                ? { state: "available", response }
                : {
                    state: "error",
                    message: "The report API returned a different batch ID.",
                  };
          } catch (requestError) {
            if (signal.aborted) return;
            result = isNotFound(requestError)
              ? {
                  state: "missing",
                  message: "The referenced report file is not present.",
                }
              : {
                  state: "error",
                  message: "The referenced run report could not be loaded.",
                };
          }
          if (!signal.aborted && isCurrent()) {
            setRunLookups((current) => {
              const next = new Map(current);
              next.set(batchId, result);
              runLookupsRef.current = next;
              return next;
            });
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(LOOKUP_CONCURRENCY, newTargets.length) },
          () => worker(),
        ),
      );
    },
    [],
  );

  const refresh = useCallback(async () => {
    listController.current?.abort();
    moreController.current?.abort();
    setLoadingMore(false);
    const controller = new AbortController();
    listController.current = controller;
    const id = ++requestId.current;
    setRefreshing(true);
    if (jobsRef.current.length === 0) setStatus("loading");
    if (!hasLoadedRef.current) setBenchmarkLookup({ state: "loading" });
    setBenchmarkError(null);
    setError(null);

    const benchmarkTask = getBenchmarkReports(controller.signal)
      .then((response): BenchmarkReportLookup => ({
        state: "available",
        response,
      }))
      .catch((requestError: unknown): BenchmarkReportLookup => {
        if (controller.signal.aborted) return { state: "loading" };
        if (isNotFound(requestError)) {
          return {
            state: "missing",
            message: "No benchmark report is currently available.",
          };
        }
        return {
          state: "error",
          message: "Benchmark reports could not be loaded from the API.",
        };
      })
      .then((lookup) => {
        if (!controller.signal.aborted && id === requestId.current) {
          setBenchmarkLookup(lookup);
          setBenchmarkError(
            lookup.state === "error" ? lookup.message : null,
          );
        }
        return lookup;
      });

    try {
      const result = await listJobs(PAGE_SIZE, 0, controller.signal);
      if (controller.signal.aborted || id !== requestId.current) return;
      setJobs(result);
      jobsRef.current = result;
      setStatus(result.length > 0 ? "ready" : "empty");
      setHasMore(result.length === PAGE_SIZE);
      setLastUpdated(new Date());
      hasLoadedRef.current = true;
      setRunLookups(new Map());
      runLookupsRef.current = new Map();
      setValidationOutputs(new Map());
      setSelectedJob({ status: "idle" });
      setSelectionRevision((current) => current + 1);
      const batchIds = referencedBatchIds(result);
      await Promise.all([
        loadRunReports(batchIds, controller.signal, () => id === requestId.current),
        benchmarkTask,
      ]);
    } catch {
      if (!controller.signal.aborted && id === requestId.current) {
        setError("Job history could not be loaded. Check the API connection and try again.");
        setStatus("error");
      }
    } finally {
      if (!controller.signal.aborted && id === requestId.current) {
        setRefreshing(false);
      }
    }
  }, [loadRunReports]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    moreController.current?.abort();
    const controller = new AbortController();
    moreController.current = controller;
    const id = requestId.current;
    const offset = jobsRef.current.length;
    setLoadingMore(true);
    try {
      const result = await listJobs(PAGE_SIZE, offset, controller.signal);
      if (controller.signal.aborted || id !== requestId.current) return;
      const existing = new Set(jobsRef.current.map((job) => job.job_id));
      const added = result.filter((job) => !existing.has(job.job_id));
      const next = [...jobsRef.current, ...added];
      setJobs(next);
      jobsRef.current = next;
      setHasMore(result.length === PAGE_SIZE);
      setLastUpdated(new Date());
      await loadRunReports(
        referencedBatchIds(added),
        controller.signal,
        () => id === requestId.current,
      );
    } catch {
      if (!controller.signal.aborted && id === requestId.current) {
        setError("Older job history could not be loaded. Try again.");
      }
    } finally {
      if (!controller.signal.aborted && id === requestId.current) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadRunReports, loadingMore]);

  const entries = useMemo(
    () =>
      buildReportCatalog(jobs, runLookups, benchmarkLookup, validationOutputs),
    [benchmarkLookup, jobs, runLookups, validationOutputs],
  );
  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const selectedJobId = selectedEntry?.jobId ?? null;
  const selectedSourceKind = selectedEntry?.sourceKind ?? null;

  const selectEntry = useCallback((entryId: string | null) => {
    selectionController.current?.abort();
    setSelectedEntryId(entryId);
    setSelectionRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob({ status: "idle" });
      return;
    }
    const jobId = selectedJobId;
    const controller = new AbortController();
    selectionController.current?.abort();
    selectionController.current = controller;
    setSelectedJob({ status: "loading", jobId });

    const listJob = jobs.find((job) => job.job_id === jobId);
    const loadSelection = async () => {
      const jobResult = await getJob(jobId, controller.signal).then(
        (job) => ({ status: "ready" as const, job }),
        () => ({ status: "error" as const }),
      );
      if (controller.signal.aborted) return;
      if (jobResult.status === "ready") {
        setSelectedJob({ status: "ready", job: jobResult.job });
      } else if (listJob) {
        setSelectedJob({ status: "ready", job: listJob });
      } else {
        setSelectedJob({
          status: "error",
          jobId,
          message: "The selected job details could not be loaded.",
        });
      }

      if (selectedSourceKind !== "validation-job" || !listJob) return;
      const currentOutput = validationOutputsRef.current.get(jobId);
      if (currentOutput?.state === "loaded") return;
      setValidationOutputs((current) => {
        const next = new Map(current);
        next.set(jobId, { state: "loading" });
        return next;
      });
      try {
        const output = await fetchValidationOutput(
          jobResult.status === "ready" ? jobResult.job : listJob,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setValidationOutputs((current) => {
            const next = new Map(current);
            next.set(jobId, { state: "loaded", output });
            return next;
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setValidationOutputs((current) => {
            const next = new Map(current);
            next.set(jobId, {
              state: "error",
              message: "Validation logs could not be loaded.",
            });
            return next;
          });
        }
      }
    };

    void loadSelection();
    return () => controller.abort();
  }, [jobs, selectedJobId, selectedSourceKind, selectionRevision]);

  useEffect(() => {
    void refresh();
    return () => {
      listController.current?.abort();
      moreController.current?.abort();
      selectionController.current?.abort();
      requestId.current += 1;
    };
  }, [refresh]);

  return {
    entries,
    jobs,
    status,
    error,
    benchmarkError,
    refreshing,
    loadingMore,
    hasMore,
    lastUpdated,
    refresh,
    loadMore,
    selectedEntry,
    selectedEntryId,
    selectEntry,
    selectedJob,
    validationOutputs,
  };
}
