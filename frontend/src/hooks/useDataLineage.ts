import { useCallback, useEffect, useRef, useState } from "react";
import { loadAssociatedRunReports } from "../services/lineageService";
import { getJob, getJobLogs, listJobs } from "../services/jobsService";
import type {
  AssociatedRunReport,
  RunReportState,
} from "../types/lineage";
import type { JobRecord } from "../types/jobs";

const JOB_LIMIT = 100;
type LoadStatus = "loading" | "ready" | "empty" | "error";
type RunLogs = { stdout: string; stderr: string; truncated: boolean };

export function useDataLineage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<RunLogs | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [runReports, setRunReports] = useState<AssociatedRunReport[]>([]);
  const [runReportState, setRunReportState] =
    useState<RunReportState>("not-applicable");
  const [runReportMessage, setRunReportMessage] = useState<string | null>(null);
  const jobsRef = useRef(jobs);
  const listController = useRef<AbortController | null>(null);
  const moreController = useRef<AbortController | null>(null);
  const listRequestId = useRef(0);

  jobsRef.current = jobs;

  const refresh = useCallback(async () => {
    listController.current?.abort();
    moreController.current?.abort();
    setLoadingMore(false);
    const controller = new AbortController();
    listController.current = controller;
    const requestId = ++listRequestId.current;
    setRefreshing(true);
    if (jobsRef.current.length === 0) setStatus("loading");

    try {
      const result = await listJobs(JOB_LIMIT, 0, controller.signal);
      if (controller.signal.aborted || requestId !== listRequestId.current) return;
      const pipelineJobs = result.filter(
        (job) =>
          job.job_type === "baseline" ||
          job.job_type === "optimized" ||
          job.job_type === "both",
      );
      setJobs(pipelineJobs);
      setHasMore(result.length === JOB_LIMIT);
      setStatus(pipelineJobs.length > 0 ? "ready" : "empty");
      setError(null);
      setLastUpdated(new Date());
      setSelectedJobId(
        (current) =>
          current ??
          pipelineJobs[0]?.job_id ??
          null,
      );
    } catch {
      if (!controller.signal.aborted && requestId === listRequestId.current) {
        setError("Pipeline run history could not be loaded. Try refreshing.");
        setStatus("error");
      }
    } finally {
      if (!controller.signal.aborted && requestId === listRequestId.current) {
        setRefreshing(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    moreController.current?.abort();
    const controller = new AbortController();
    moreController.current = controller;
    const requestId = listRequestId.current;
    const offset = jobsRef.current.length;
    setLoadingMore(true);
    try {
      const result = await listJobs(JOB_LIMIT, offset, controller.signal);
      if (controller.signal.aborted || requestId !== listRequestId.current) return;
      const existing = new Set(jobsRef.current.map((job) => job.job_id));
      const pipelineJobs = result.filter(
        (job) =>
          (job.job_type === "baseline" ||
            job.job_type === "optimized" ||
            job.job_type === "both") &&
          !existing.has(job.job_id),
      );
      setJobs((current) => [...current, ...pipelineJobs]);
      setHasMore(result.length === JOB_LIMIT);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      if (!controller.signal.aborted && requestId === listRequestId.current) {
        setError("Older pipeline runs could not be loaded. Try again.");
      }
    } finally {
      if (!controller.signal.aborted && requestId === listRequestId.current) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore]);

  const selectJob = useCallback((jobId: string) => {
    setSelectedJobId(jobId || null);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      listController.current?.abort();
      moreController.current?.abort();
      listRequestId.current += 1;
    };
  }, [refresh]);

  const selectedListJob =
    jobs.find((job) => job.job_id === selectedJobId) ?? null;

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      setDetailsLoading(false);
      setDetailsError(null);
      setLogs(null);
      setLogsError(null);
      setRunReports([]);
      setRunReportState("not-applicable");
      setRunReportMessage(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setSelectedJob(selectedListJob);
    setDetailsLoading(true);
    setDetailsError(null);
    setLogs(null);
    setLogsError(null);
    setRunReports([]);
    setRunReportState("loading");
    setRunReportMessage(null);

    const loadSelection = async () => {
      const [jobResult, logsResult] = await Promise.allSettled([
        getJob(selectedJobId, controller.signal),
        getJobLogs(selectedJobId, controller.signal),
      ]);
      if (!active || controller.signal.aborted) return;

      const job =
        jobResult.status === "fulfilled" ? jobResult.value : selectedListJob;
      if (jobResult.status === "fulfilled") {
        setSelectedJob(jobResult.value);
      } else {
        setSelectedJob(selectedListJob);
        setDetailsError(
          "Run details could not be loaded. Showing the saved history record.",
        );
      }

      if (logsResult.status === "fulfilled") {
        setLogs({
          stdout: logsResult.value.stdout,
          stderr: logsResult.value.stderr,
          truncated: logsResult.value.truncated,
        });
      } else {
        setLogsError("Execution logs are unavailable for this run.");
      }

      if (!job) {
        setRunReportState("unavailable");
        setRunReportMessage("Run metadata is unavailable.");
        setDetailsLoading(false);
        return;
      }

      const reportResult = await loadAssociatedRunReports(
        job,
        controller.signal,
      );
      if (!active || controller.signal.aborted) return;
      setRunReports(reportResult.reports);
      setRunReportState(reportResult.state);
      setRunReportMessage(reportResult.message);
      setDetailsLoading(false);
    };

    void loadSelection();
    return () => {
      active = false;
      controller.abort();
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
    selectJob,
    selectedJob: selectedJob ?? selectedListJob,
    detailsLoading,
    detailsError,
    logs,
    logsError,
    runReports,
    runReportState,
    runReportMessage,
  };
}
