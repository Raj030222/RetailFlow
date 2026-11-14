import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchValidationJobs,
  fetchValidationOutput,
} from "../services/dataQualityService";
import type { SubmitOnce } from "../services/jobsService";
import type { ValidationOutput } from "../types/dataQuality";
import type { JobRecord, JobSubmission } from "../types/jobs";

type LoadStatus = "loading" | "ready" | "empty" | "error";
type OutputMap = Record<string, ValidationOutput>;

function isActive(job: JobRecord): boolean {
  return job.status === "queued" || job.status === "running";
}

function sortNewestFirst(jobs: JobRecord[]): JobRecord[] {
  return [...jobs].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  );
}

export function useDataQuality() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [outputs, setOutputs] = useState<OutputMap>({});
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobSnapshot, setSelectedJobSnapshot] = useState<JobRecord | null>(
    null,
  );
  const [submissionPending, setSubmissionPending] = useState(false);
  const jobsRef = useRef(jobs);
  const outputsRef = useRef(outputs);
  const selectedJobIdRef = useRef(selectedJobId);
  const submissionPendingRef = useRef(false);
  const nextOffset = useRef(0);
  const listRequestId = useRef(0);
  const listController = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const outputController = useRef<AbortController | null>(null);
  const outputRequests = useRef(new Set<string>());

  jobsRef.current = jobs;
  outputsRef.current = outputs;
  selectedJobIdRef.current = selectedJobId;

  const loadOutputs = useCallback((validationJobs: JobRecord[], retryErrors: boolean) => {
    const controller =
      outputController.current && !outputController.current.signal.aborted
        ? outputController.current
        : new AbortController();
    outputController.current = controller;
    const targets = validationJobs.filter((job) => {
      if (isActive(job) || outputRequests.current.has(job.job_id)) return false;
      const current = outputsRef.current[job.job_id];
      return !current || (retryErrors && current.state === "error");
    });
    if (targets.length === 0) return;

    const updateOutput = (jobId: string, output: ValidationOutput) => {
      outputsRef.current = { ...outputsRef.current, [jobId]: output };
      setOutputs(outputsRef.current);
    };
    for (const job of targets) {
      outputRequests.current.add(job.job_id);
      updateOutput(job.job_id, {
        job_id: job.job_id,
        stdout: "",
        stderr: "",
        truncated: false,
        state: "loading",
        report: null,
      });
    }

    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length && !controller.signal.aborted) {
        const job = targets[cursor];
        cursor += 1;
        if (!job) continue;
        try {
          const output = await fetchValidationOutput(job, controller.signal);
          if (!controller.signal.aborted) updateOutput(job.job_id, output);
        } catch {
          if (!controller.signal.aborted) {
            updateOutput(job.job_id, {
              job_id: job.job_id,
              stdout: "",
              stderr: "",
              truncated: false,
              state: "error",
              report: null,
              message: "Validation logs could not be loaded.",
            });
          }
        } finally {
          outputRequests.current.delete(job.job_id);
        }
      }
    };
    void Promise.all(
      Array.from({ length: Math.min(4, targets.length) }, () => worker()),
    );
  }, []);

  const refresh = useCallback(
    async (retryLogErrors = false) => {
      listController.current?.abort();
      moreController.current?.abort();
      setLoadingMore(false);
      const controller = new AbortController();
      listController.current = controller;
      const requestId = ++listRequestId.current;
      setRefreshing(true);
      if (jobsRef.current.length === 0) setStatus("loading");

      try {
        const page = await fetchValidationJobs(0, controller.signal);
        if (controller.signal.aborted || requestId !== listRequestId.current) return;
        const nextJobs = sortNewestFirst(page.jobs);
        nextOffset.current = page.scanned;
        setJobs(nextJobs);
        setStatus(nextJobs.length > 0 ? "ready" : page.hasMore ? "ready" : "empty");
        setHasMore(page.hasMore);
        setError(null);
        setLastUpdated(new Date());

        const selectedId = selectedJobIdRef.current;
        const selectedFromPage = nextJobs.find((job) => job.job_id === selectedId);
        if (selectedFromPage) setSelectedJobSnapshot(selectedFromPage);
        else if (!selectedId && nextJobs[0]) {
          setSelectedJobId(nextJobs[0].job_id);
          setSelectedJobSnapshot(nextJobs[0]);
        }
        loadOutputs(nextJobs, retryLogErrors);
      } catch {
        if (!controller.signal.aborted && requestId === listRequestId.current) {
          setError("Validation history could not be refreshed. Existing results are retained.");
          setStatus("error");
        }
      } finally {
        if (!controller.signal.aborted && requestId === listRequestId.current) {
          setRefreshing(false);
        }
      }
    },
    [loadOutputs],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    moreController.current?.abort();
    const controller = new AbortController();
    moreController.current = controller;
    const requestId = listRequestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchValidationJobs(nextOffset.current, controller.signal);
      if (controller.signal.aborted || requestId !== listRequestId.current) return;
      nextOffset.current += page.scanned;
      const existing = new Set(jobsRef.current.map((job) => job.job_id));
      const nextJobs = sortNewestFirst([
        ...jobsRef.current,
        ...page.jobs.filter((job) => !existing.has(job.job_id)),
      ]);
      setJobs(nextJobs);
      if (!selectedJobIdRef.current && nextJobs[0]) {
        selectedJobIdRef.current = nextJobs[0].job_id;
        setSelectedJobId(nextJobs[0].job_id);
        setSelectedJobSnapshot(nextJobs[0]);
      }
      setHasMore(page.hasMore);
      setError(null);
      setLastUpdated(new Date());
      loadOutputs(page.jobs, false);
    } catch {
      if (!controller.signal.aborted && requestId === listRequestId.current) {
        setError("Older validation jobs could not be loaded. Try again.");
      }
    } finally {
      if (!controller.signal.aborted && requestId === listRequestId.current) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore, loadOutputs]);

  const selectJob = useCallback((job: JobRecord) => {
    selectedJobIdRef.current = job.job_id;
    setSelectedJobId(job.job_id);
    setSelectedJobSnapshot(job);
  }, []);

  const isDuplicateActive = useCallback(
    (fingerprint: string) => {
      void fingerprint;
      return (
        status === "loading" ||
        submissionPending ||
        jobsRef.current.some(
        (job) => job.job_type === "validate" && isActive(job),
        )
      );
    },
    [status, submissionPending],
  );

  const submitOnce: SubmitOnce = useCallback(
    async (fingerprint, operation) => {
      void fingerprint;
      if (
        submissionPendingRef.current ||
        jobsRef.current.some(
          (job) => job.job_type === "validate" && isActive(job),
        )
      ) {
        return null;
      }
      submissionPendingRef.current = true;
      setSubmissionPending(true);
      try {
        const submission: JobSubmission = await operation();
        const optimisticJob: JobRecord = {
          ...submission,
          started_at: null,
          completed_at: null,
          exit_code: null,
          error_summary: null,
          report_references: {},
        };
        setJobs((current) => [
          optimisticJob,
          ...current.filter((job) => job.job_id !== optimisticJob.job_id),
        ]);
        selectedJobIdRef.current = optimisticJob.job_id;
        setSelectedJobId(optimisticJob.job_id);
        setSelectedJobSnapshot(optimisticJob);
        void refresh(true);
        return submission;
      } finally {
        submissionPendingRef.current = false;
        setSubmissionPending(false);
      }
    },
    [refresh],
  );

  const validationJobs = useMemo(
    () => sortNewestFirst(jobs.filter((job) => job.job_type === "validate")),
    [jobs],
  );
  const selectedJob =
    validationJobs.find((job) => job.job_id === selectedJobId) ??
    selectedJobSnapshot;
  const activeValidation = validationJobs.some(isActive);

  useEffect(() => {
    const controller = new AbortController();
    outputController.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      listController.current?.abort();
      moreController.current?.abort();
      listRequestId.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(
        () => void refresh(),
        activeValidation ? 5_000 : 30_000,
      );
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (timer !== undefined) window.clearTimeout(timer);
        void refresh();
      } else if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeValidation, refresh]);

  return {
    jobs: validationJobs,
    outputs,
    status,
    error,
    refreshing,
    loadingMore,
    hasMore,
    lastUpdated,
    refresh,
    loadMore,
    selectedJob,
    selectedJobId,
    selectJob,
    activeValidation,
    submissionPending,
    submitOnce,
    isDuplicateActive,
  };
}
