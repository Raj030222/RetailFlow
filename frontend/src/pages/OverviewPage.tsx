import {
  Activity,
  CheckCircle2,
  Clock3,
  ListChecks,
  XCircle,
} from "lucide-react";
import { calculatePipelineKpis, formatDuration } from "../lib/dashboardMetrics";
import { useDashboardData } from "../hooks/useDashboardData";
import { DashboardHeader } from "../components/dashboard/DashboardHeader";
import { KpiCard } from "../components/dashboard/KpiCard";
import { PipelinePerformance } from "../components/dashboard/PipelinePerformance";
import { DataQualitySummary } from "../components/dashboard/DataQualitySummary";
import { RecentActivity } from "../components/dashboard/RecentActivity";
import { BenchmarkSummary } from "../components/dashboard/BenchmarkSummary";
import { QuickActions } from "../components/dashboard/QuickActions";

export function OverviewPage() {
  const { data, refresh } = useDashboardData();
  const kpis = calculatePipelineKpis(
    data.jobs.jobs,
    data.jobs.jobs.length === 100,
  );
  const unavailable = data.jobs.status === "error" && data.jobs.jobs.length === 0;
  const loading = data.jobs.status === "loading";
  const historyNote =
    data.jobs.status === "error" && data.jobs.jobs.length > 0
      ? "Refresh failed; values reflect the last loaded job history."
      : data.jobs.message
        ? "Latest 100 jobs only; API provides no total count."
        : "Based on persisted pipeline jobs.";

  return (
    <div className="space-y-7">
      <DashboardHeader
        lastUpdated={data.lastUpdated}
        onRefresh={() => void refresh()}
        refreshing={data.refreshing}
      />

      <section
        aria-label="Pipeline run metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          detail={
            unavailable
              ? "Job history could not be loaded."
              : kpis.limited || data.jobs.status === "error"
                ? historyNote
                : `${kpis.running} running · ${kpis.queued} queued`
          }
          icon={Activity}
          label="Total pipeline runs"
          loading={loading}
          value={unavailable ? "Unavailable" : kpis.total.toLocaleString()}
        />
        <KpiCard
          detail={unavailable ? "Job history could not be loaded." : historyNote}
          icon={CheckCircle2}
          label="Successful runs"
          loading={loading}
          tone="success"
          value={unavailable ? "Unavailable" : kpis.succeeded.toLocaleString()}
        />
        <KpiCard
          detail={unavailable ? "Job history could not be loaded." : historyNote}
          icon={XCircle}
          label="Failed runs"
          loading={loading}
          tone="danger"
          value={unavailable ? "Unavailable" : kpis.failed.toLocaleString()}
        />
        <KpiCard
          detail={
            unavailable
              ? "Job history could not be loaded."
              : "Latest completed pipeline execution."
          }
          icon={Clock3}
          label="Latest execution duration"
          loading={loading}
          value={
            unavailable ? "Unavailable" : formatDuration(kpis.latestDurationSeconds)
          }
        />
      </section>

      {data.jobs.status === "empty" && (
        <p className="text-xs text-muted-foreground" role="status">
          No pipeline runs have been recorded yet. KPI values reflect the empty job history.
        </p>
      )}

      <section aria-labelledby="overview-signals-heading" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold" id="overview-signals-heading">
            Latest pipeline signals
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Performance and validation outcomes from the latest available reports.
          </p>
        </div>
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">
          <PipelinePerformance data={data.benchmark} />
          <DataQualitySummary data={data.quality} />
        </div>
      </section>

      <RecentActivity data={data.jobs} />

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <BenchmarkSummary data={data.benchmark} />
        <QuickActions jobs={data.jobs.jobs} onSubmitted={refresh} />
      </section>

      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ListChecks aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Dashboard values come from API job history and existing reports. Missing
          report fields are shown as unavailable, not inferred.
        </span>
      </p>
    </div>
  );
}
