import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getJob,
  getJobLogs,
  listJobs,
  type SubmitOnce,
} from "../services/jobsService";
import type { JobRecord, JobStatus } from "../types/jobs";

const ACTIVE_REFRESH_MS = 5_000;
const JOB_LIMIT = 100;

type LoadStatus = "loading" | "ready" | "empty" | "error";
type TrackedSubmission = { jobId: string; fingerprint: string };

function isActive(status: JobStatus): boolean {
  return status === "queued" || status === "running";
}

export function usePipelineJobs() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [logsTruncated, setLogsTruncated] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<TrackedSubmission[]>([]);
  const pendingFingerprints = useRef(new Set<string>());
  const [pendingVersion, setPendingVersion] = useState(0);
  const jobsRef = useRef(jobs);
  const trackedRef = useRef(tracked);
  const listController = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const requestId = useRef(0);

  jobsRef.current = jobs;
  trackedRef.current = tracked;

  const refresh = useCallback(async () => {
    listController.current?.abort();
    moreController.current?.abort();
    setLoadingMore(false);
    const controller = new AbortController();
    listController.current = controller;
    const id = ++requestId.current;
    setRefreshing(true);
    if (jobsRef.current.length === 0) setStatus("loading");

    const knownJobs = await Promise.allSettled(
      trackedRef.current
        .filter(({ jobId }) => !jobsRef.current.some((job) => job.job_id === jobId))
        .map(({ jobId }) => getJob(jobId, controller.signal)),
    );
    const unseenTracked = knownJobs.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const listResult = await Promise.allSettled([
      listJobs(JOB_LIMIT, 0, controller.signal),
    ]);

    if (controller.signal.aborted || id !== requestId.current) return;
    if (listResult[0].status === "rejected") {
      setError("Job history could not be refreshed. Existing results are retained.");
      setStatus("error");
      setRefreshing(false);
      return;
    }

    const nextJobs = listResult[0].value;
    setJobs(nextJobs);
    setHasMore(nextJobs.length === JOB_LIMIT);
    setStatus(nextJobs.length > 0 ? "ready" : "empty");
    setError(null);
    setLastUpdated(new Date());
    setRefreshing(false);

    const statusById = new Map(
      [...nextJobs, ...unseenTracked].map((job) => [job.job_id, job.status]),
    );
    setTracked((previous) =>
      previous.filter(({ jobId }) => {
        const latestStatus = statusById.get(jobId);
        return latestStatus === undefined || isActive(latestStatus);
      }),
    );

    const newestJob = nextJobs[0];
    if (newestJob) {
      setSelectedJobId((current) => current ?? newestJob.job_id);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    const offset = jobsRef.current.length;
    const id = requestId.current;
    moreController.current?.abort();
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);
    try {
      const next = await listJobs(JOB_LIMIT, offset, controller.signal);
      if (controller.signal.aborted || id !== requestId.current) return;
      setJobs((current) => {
        const existing = new Set(current.map((job) => job.job_id));
        return [...current, ...next.filter((job) => !existing.has(job.job_id))];
      });
      setHasMore(next.length === JOB_LIMIT);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      if (!controller.signal.aborted && id === requestId.current) {
        setError("Older job history could not be loaded. Try again.");
      }
    } finally {
      if (!controller.signal.aborted && id === requestId.current) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore]);

  const submitOnce: SubmitOnce = useCallback(
    async (fingerprint, operation) => {
      const alreadyActive = trackedRef.current.some((trackedJob) => {
        if (trackedJob.fingerprint !== fingerprint) return false;
        const currentJob = jobsRef.current.find(
          (job) => job.job_id === trackedJob.jobId,
        );
        return !currentJob || isActive(currentJob.status);
      });
      if (alreadyActive || pendingFingerprints.current.has(fingerprint)) return null;

      pendingFingerprints.current.add(fingerprint);
      setPendingVersion((value) => value + 1);
      try {
        const submission = await operation();
        setTracked((previous) => [
          ...previous.filter((item) => item.jobId !== submission.job_id),
          { jobId: submission.job_id, fingerprint },
        ]);
        setSelectedJobId(submission.job_id);
        void refresh();
        return submission;
      } finally {
        pendingFingerprints.current.delete(fingerprint);
        setPendingVersion((value) => value + 1);
      }
    },
    [refresh],
  );

  const isDuplicateActive = useCallback(
    (fingerprint: string) => {
      void pendingVersion;
      return (
        pendingFingerprints.current.has(fingerprint) ||
        tracked.some((item) => {
          if (item.fingerprint !== fingerprint) return false;
          const currentJob = jobsRef.current.find(
            (job) => job.job_id === item.jobId,
          );
          return !currentJob || isActive(currentJob.status);
        })
      );
    },
    [pendingVersion, tracked],
  );

  const activeJobs = useMemo(
    () =>
      jobs.slice(0, JOB_LIMIT).some((job) => isActive(job.status)) ||
      tracked.some(({ jobId }) => !jobs.some((job) => job.job_id === jobId)),
    [jobs, tracked],
  );

  useEffect(() => {
    void refresh();
    return () => {
      listController.current?.abort();
      moreController.current?.abort();
      requestId.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (!activeJobs) return;
    let timer: number | undefined;
    const schedule = () => {
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => void refresh(), ACTIVE_REFRESH_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (timer !== undefined) window.clearTimeout(timer);
        void refresh();
        schedule();
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
  }, [activeJobs, refresh]);

  const selectedListJob = jobs.find((job) => job.job_id === selectedJobId) ?? null;
  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      setStdout("");
      setStderr("");
      setLogsTruncated(false);
      setDetailsError(null);
      setLogsError(null);
      return;
    }
    let current = true;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    const loadDetails = async () => {
      controller?.abort();
      controller = new AbortController();
      setDetailsLoading(true);
      const [jobResult, logsResult] = await Promise.allSettled([
        getJob(selectedJobId, controller.signal),
        getJobLogs(selectedJobId, controller.signal),
      ]);
      if (!current || controller.signal.aborted) return;
      if (jobResult.status === "fulfilled") {
        setSelectedJob(jobResult.value);
        setDetailsError(null);
        if (!selectedListJob && isActive(jobResult.value.status) && timer === undefined) {
          timer = window.setInterval(() => void loadDetails(), ACTIVE_REFRESH_MS);
        } else if (!isActive(jobResult.value.status) && timer !== undefined) {
          window.clearInterval(timer);
          timer = undefined;
        }
      } else {
        setSelectedJob(selectedListJob);
        setDetailsError("Job details could not be refreshed. Showing saved history data.");
      }
      if (logsResult.status === "fulfilled") {
        setStdout(logsResult.value.stdout);
        setStderr(logsResult.value.stderr);
        setLogsTruncated(logsResult.value.truncated);
        setLogsError(null);
      } else {
        setLogsError("Logs could not be loaded. Refresh to try again.");
      }
      setDetailsLoading(false);
    };

    setSelectedJob(selectedListJob);
    setStdout("");
    setStderr("");
    setLogsTruncated(false);
    setDetailsError(null);
    setLogsError(null);
    void loadDetails();
    return () => {
      current = false;
      if (timer !== undefined) window.clearInterval(timer);
      controller?.abort();
    };
  }, [selectedJobId, selectedListJob]);

  return {
    jobs,
    status,
    error,
    refreshing,
    loadingMore,
    hasMore,
    loadMore,
    lastUpdated,
    refresh,
    selectedJobId,
    selectJob: setSelectedJobId,
    selectedJob: selectedJob ?? selectedListJob,
    stdout,
    stderr,
    logsTruncated,
    detailsLoading,
    detailsError,
    logsError,
    isDuplicateActive,
    submitOnce,
  };
}
