import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  hasActiveJobs,
  loadBenchmarkWidget,
  loadJobsWidget,
  loadQualityWidget,
} from "../services/dashboardService";
import type {
  BenchmarkWidgetData,
  DashboardData,
  JobWidgetData,
  QualityWidgetData,
} from "../types/dashboard";

const IDLE_REFRESH_MS = 30_000;
const ACTIVE_REFRESH_MS = 8_000;

const initialJobs: JobWidgetData = { status: "loading", jobs: [] };
const initialBenchmark: BenchmarkWidgetData = { status: "loading", report: null };
const initialQuality: QualityWidgetData = {
  status: "loading",
  source: null,
  report: null,
};

export function useDashboardData() {
  const [data, setData] = useState<DashboardData>({
    jobs: initialJobs,
    benchmark: initialBenchmark,
    quality: initialQuality,
    lastUpdated: null,
    refreshing: false,
  });
  const dataRef = useRef(data);
  dataRef.current = data;
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const currentController = new AbortController();
    controller.current = currentController;
    const currentId = ++requestId.current;
    setData((current) => ({ ...current, refreshing: true }));

    const [jobsResult, benchmarkResult] = await Promise.allSettled([
      loadJobsWidget(currentController.signal),
      loadBenchmarkWidget(currentController.signal),
    ]);
    if (currentController.signal.aborted || currentId !== requestId.current) return;

    const jobs: JobWidgetData =
      jobsResult.status === "fulfilled"
        ? jobsResult.value
        : {
            status: "error",
            jobs: dataRef.current.jobs.jobs,
            message: "Job history could not be loaded.",
          };
    const benchmark: BenchmarkWidgetData =
      benchmarkResult.status === "fulfilled"
        ? benchmarkResult.value
        : {
            status: "error",
            report: dataRef.current.benchmark.report,
            message: "Benchmark report could not be loaded.",
          };
    const qualityResult = jobsResult.status === "fulfilled"
      ? await Promise.allSettled([
          loadQualityWidget(jobsResult.value.jobs, currentController.signal),
        ])
      : null;
    if (currentController.signal.aborted || currentId !== requestId.current) return;

    const quality: QualityWidgetData =
      qualityResult?.[0]?.status === "fulfilled"
        ? qualityResult[0].value
        : qualityResult?.[0]?.status === "rejected"
          ? {
              status: "error",
              source: null,
              report: null,
              message: "Validation and reconciliation data could not be loaded.",
            }
          : {
              status: "error",
              source: null,
              report: null,
              message: "Job history is unavailable, so quality reports cannot be located.",
            };

    setData((current) => ({
      ...current,
      jobs,
      benchmark,
      quality,
      lastUpdated: new Date(),
      refreshing: false,
    }));
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      controller.current?.abort();
      requestId.current += 1;
    };
  }, [refresh]);

  const activeJobs = useMemo(
    () => hasActiveJobs(data.jobs.jobs),
    [data.jobs.jobs],
  );

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(
        () => void refresh(),
        activeJobs ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS,
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
  }, [activeJobs, refresh]);

  return { data, refresh };
}
