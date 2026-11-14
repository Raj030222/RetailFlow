import {
  Activity,
  BarChart3,
  CircleAlert,
  Gauge,
  RefreshCw,
  Rows3,
  Timer,
} from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/common/States";
import { Panel } from "../components/common/Panel";
import { JobStatusBadge } from "../components/pipeline/JobStatusBadge";
import { BenchmarkExecutionCard } from "../components/pipeline/BenchmarkExecutionCard";
import { Button } from "../components/ui/button";
import { useDashboardData } from "../hooks/useDashboardData";
import { usePipelineJobs } from "../hooks/usePipelineJobs";
import { formatSeconds, formatTimestamp } from "../lib/dashboardMetrics";
import {
  interpretBenchmark,
  reportedImprovement,
  speedupFactor,
} from "../lib/performanceMetrics";
import type { BenchmarkReport, JobRecord } from "../types/jobs";

function latestBenchmark(jobs: JobRecord[]): JobRecord | null {
  return (
    jobs
      .filter((job) => job.job_type === "benchmark")
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ??
    null
  );
}

function Comparison({ report }: { report: BenchmarkReport }) {
  const baseline = report.baseline.median_seconds;
  const optimized = report.optimized.median_seconds;
  const maximum = Math.max(baseline, optimized);
  const comparisonValid = report.equivalent === true;
  const enoughRepetitions = report.repetitions >= 2;
  const assessable =
    comparisonValid &&
    enoughRepetitions &&
    Number.isFinite(baseline) &&
    Number.isFinite(optimized);
  const improvement = reportedImprovement(report);
  const speedup = speedupFactor(report);
  const timeDifference =
    assessable && Number.isFinite(baseline) && Number.isFinite(optimized)
      ? `${formatSeconds(Math.abs(baseline - optimized))} ${
          baseline >= optimized ? "saved" : "slower"
        }`
      : "Not assessed";
  const durations = [
    { label: "Baseline median", seconds: baseline, color: "bg-slate-400 dark:bg-slate-500" },
    { label: "Optimized median", seconds: optimized, color: "bg-primary" },
  ];

  return (
    <Panel
      description="Median execution times reported together in the latest available benchmark report."
      icon={<BarChart3 aria-hidden="true" className="h-4 w-4" />}
      title="Baseline vs optimized"
    >
      <div className="space-y-5">
        {!comparisonValid && (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-5 text-destructive"
            role="status"
          >
            Output equivalence was not established. Durations are shown for diagnosis only.
          </p>
        )}
        {comparisonValid && !enoughRepetitions && (
          <p
            className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-5 text-muted-foreground"
            role="status"
          >
            The report has fewer than two repetitions, so no performance improvement is assessed.
          </p>
        )}

        <div
          aria-label="Median execution duration comparison in seconds"
          className="rounded-lg border border-border bg-muted/20 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold">Median runtime</h3>
            <span className="text-[11px] text-muted-foreground">Seconds</span>
          </div>
          <div className="mt-4 space-y-4">
            {durations.map(({ label, seconds, color }) => (
              <div
                className="grid gap-2 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-center"
                key={label}
              >
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatSeconds(seconds)}
                  </p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    aria-hidden="true"
                    className={`h-full rounded-full ${color}`}
                    style={{
                      width:
                        maximum > 0
                          ? `${Math.max(2, (seconds / maximum) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ["Time difference", timeDifference],
            [
              "Improvement",
              improvement !== null ? `${improvement.toFixed(1)}%` : "Not assessed",
            ],
            [
              "Speedup factor · derived",
              speedup !== null && Number.isFinite(speedup)
                ? `${speedup.toFixed(2)}×`
                : "Not available",
            ],
          ].map(([label, value]) => (
            <div className="rounded-md border border-border bg-background p-3" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="text-xs leading-5 text-muted-foreground">
          {report.performance_note}
        </p>
      </div>
    </Panel>
  );
}

function BenchmarkReportContext({ report }: { report: BenchmarkReport }) {
  const facts = [
    { label: "Records processed", value: report.records.toLocaleString(), icon: Rows3 },
    { label: "Repetitions", value: report.repetitions.toLocaleString(), icon: RefreshCw },
    {
      label: "Output equivalence",
      value: report.equivalent ? "Equivalent" : "Not equivalent",
      icon: report.equivalent ? Gauge : CircleAlert,
    },
    {
      label: "Assessment",
      value: interpretBenchmark(report),
      icon: Activity,
    },
  ];

  return (
    <Panel
      description="Report metadata is shown separately from persisted job history."
      title="Benchmark report context"
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        {facts.map(({ label, value, icon: Icon }) => (
          <div className="min-w-0 rounded-md border border-border bg-muted/20 p-3" key={label}>
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {label}
            </dt>
            <dd className="mt-2 break-words text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function BenchmarkHistory({
  jobs,
  status,
  error,
}: {
  jobs: JobRecord[];
  status: "loading" | "ready" | "empty" | "error";
  error: string | null;
}) {
  const benchmarkJobs = jobs.filter((job) => job.job_type === "benchmark");

  return (
    <Panel
      description="Persisted benchmark jobs from loaded API history; the current API does not link these jobs to a published report."
      title="Benchmark job history"
    >
      {error && (
        <div className="mb-4">
          <ErrorState description={error} title="Benchmark job history unavailable" />
        </div>
      )}
      {status === "loading" && benchmarkJobs.length === 0 ? (
        <LoadingState label="Loading benchmark job history" />
      ) : benchmarkJobs.length === 0 ? (
        <EmptyState
          description="No benchmark job is present in the loaded persisted job history."
          title={status === "error" ? "Benchmark history unavailable" : "No benchmark jobs"}
        />
      ) : (
        <>
          <div className="max-h-80 overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <caption className="sr-only">
                Persisted benchmark jobs in the loaded job history
              </caption>
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">Job ID</th>
                  <th className="px-3 py-2.5">Created</th>
                  <th className="px-3 py-2.5">Execution status</th>
                  <th className="px-3 py-2.5">Exit code</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkJobs.map((job) => (
                  <tr className="border-b border-border/70 last:border-0" key={job.job_id}>
                    <td className="px-3 py-3 font-mono text-[11px]" title={job.job_id}>
                      {job.job_id}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatTimestamp(job.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {job.exit_code ?? "Not available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            The API provides offset-based job pages without a total history count. This list reflects benchmark jobs in the records loaded so far.
          </p>
        </>
      )}
    </Panel>
  );
}

function LatestBenchmarkJob({
  job,
  status,
}: {
  job: JobRecord | null;
  status: "loading" | "ready" | "empty" | "error";
}) {
  return (
    <Panel
      description="Execution metadata for the latest benchmark job in loaded job history."
      title="Latest benchmark job"
    >
      {status === "loading" && !job ? (
        <LoadingState label="Loading the latest benchmark job" />
      ) : job ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Job ID</p>
              <p className="mt-1 break-all font-mono text-xs">{job.job_id}</p>
            </div>
            <JobStatusBadge status={job.status} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-border py-4 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="mt-1 font-medium">{formatTimestamp(job.created_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Started</dt>
              <dd className="mt-1 font-medium">{formatTimestamp(job.started_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Completed</dt>
              <dd className="mt-1 font-medium">{formatTimestamp(job.completed_at)}</dd>
            </div>
          </dl>
          {job.error_summary && (
            <p className="mt-4 text-xs leading-5 text-destructive" role="alert">
              {job.error_summary}
            </p>
          )}
        </>
      ) : status === "error" ? (
        <ErrorState description="The latest benchmark job could not be loaded." />
      ) : (
        <EmptyState
          description="No persisted benchmark job is present in the loaded history."
          title="No benchmark job available"
        />
      )}
      <p className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        The benchmark endpoint exposes a latest fixed report without a report timestamp or producing job ID. The report above is not attributed to this job.
      </p>
    </Panel>
  );
}

export function PerformancePage() {
  const dashboard = useDashboardData();
  const monitor = usePipelineJobs();
  const report = dashboard.data.benchmark.report;
  const latestJob = latestBenchmark(monitor.jobs);
  const benchmarkActive =
    latestJob?.status === "queued" || latestJob?.status === "running";
  const inspectJob = (jobId: string) => monitor.selectJob(jobId);
  const latestJobTimestamp = formatTimestamp(
    latestJob?.completed_at ?? latestJob?.created_at ?? null,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Latest job · {latestJobTimestamp}
            </span>
            <Button
              disabled={dashboard.data.refreshing}
              onClick={() => void dashboard.refresh()}
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${dashboard.data.refreshing ? "animate-spin" : ""}`}
              />
              Refresh report
            </Button>
          </div>
        }
        description="Review published benchmark measurements and persisted execution history without implying a report-to-job link the API does not provide."
        eyebrow="Analytics"
        title="Performance Analytics"
      />

      {benchmarkActive && latestJob && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">Benchmark job in progress</p>
            <JobStatusBadge status={latestJob.status} />
          </div>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
            {latestJob.job_id}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The currently available report remains the latest published report; the API does not confirm whether this job produced it.
          </p>
        </div>
      )}

      {dashboard.data.benchmark.status === "error" && (
        <ErrorState
          title="Benchmark report unavailable"
          description={dashboard.data.benchmark.message ?? "The benchmark API could not be reached."}
        />
      )}
      {dashboard.data.benchmark.status === "loading" && !report ? (
        <Panel title="Benchmark report">
          <LoadingState label="Loading benchmark report" />
        </Panel>
      ) : report ? (
        <>
          <Comparison report={report} />
          <BenchmarkReportContext report={report} />
        </>
      ) : dashboard.data.benchmark.status !== "error" ? (
        <EmptyState
          title="No benchmark report available"
          description="Submit a benchmark below to create an actual PySpark performance report."
        />
      ) : null}

      <BenchmarkExecutionCard
        jobs={monitor.jobs}
        submitOnce={monitor.submitOnce}
        isDuplicateActive={monitor.isDuplicateActive}
        onInspect={inspectJob}
      />

      <section className="grid items-start gap-5 xl:grid-cols-2">
        <BenchmarkHistory
          error={monitor.error}
          jobs={monitor.jobs}
          status={monitor.status}
        />
        <LatestBenchmarkJob job={latestJob} status={monitor.status} />
      </section>

      <Panel
        icon={<Timer aria-hidden="true" className="h-4 w-4" />}
        title="How to interpret results"
        description="Local measurements describe this run and machine."
      >
        <p className="text-xs leading-5 text-muted-foreground">
          Multiple repetitions reduce sensitivity to JVM startup, filesystem cache, and system load. Baseline and optimized runs should use equivalent datasets, and output equivalence is required before describing a performance gain. Larger inputs can help explore behavior at higher workloads, but local benchmarks do not establish production throughput or scalability.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Dashboard data refreshed: {formatTimestamp(dashboard.data.lastUpdated?.toISOString() ?? null)}
        </p>
      </Panel>
    </div>
  );
}
