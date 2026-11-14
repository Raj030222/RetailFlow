import { BarChart3, Check, CircleAlert } from "lucide-react";
import type { BenchmarkWidgetData } from "../../types/dashboard";
import { formatSeconds } from "../../lib/dashboardMetrics";
import { EmptyState, ErrorState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";

function PerformanceBars({
  baseline,
  optimized,
}: {
  baseline: number;
  optimized: number;
}) {
  const maximum = Math.max(baseline, optimized);
  const rows = [
    { label: "Baseline", seconds: baseline, color: "bg-slate-400 dark:bg-slate-500" },
    { label: "Optimized", seconds: optimized, color: "bg-primary" },
  ];
  return (
    <div aria-label="Execution duration comparison in seconds" className="mt-5 space-y-4">
      {rows.map((row) => (
        <div className="grid grid-cols-[76px_minmax(0,1fr)_70px] items-center gap-3" key={row.label}>
          <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              aria-label={`${row.label}: ${row.seconds} seconds`}
              className={`h-full rounded-full ${row.color}`}
              style={{ width: `${maximum > 0 ? Math.max(2, (row.seconds / maximum) * 100) : 0}%` }}
            />
          </div>
          <span className="text-right text-xs font-semibold tabular-nums">
            {formatSeconds(row.seconds)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PipelinePerformance({
  data,
}: {
  data: BenchmarkWidgetData;
}) {
  if (data.status === "loading") {
    return (
      <Panel description="Baseline versus optimized execution from the latest benchmark report." title="Pipeline performance">
        <LoadingState label="Loading benchmark comparison" />
      </Panel>
    );
  }
  if (data.status === "error") {
    return (
      <Panel title="Pipeline performance">
        <ErrorState description={data.message ?? "Benchmark information is unavailable."} />
      </Panel>
    );
  }
  if (!data.report) {
    return (
      <Panel title="Pipeline performance">
        <EmptyState
          description="Run a benchmark to compare execution durations from a single report."
          title="No benchmark report available"
        />
      </Panel>
    );
  }

  const report = data.report;
  const inconclusive =
    report.performance_assessment === "insufficient_repetitions" ||
    report.repetitions < 2;
  const comparable = report.equivalent && !inconclusive;
  const improvement =
    comparable && typeof report.improvement_percent === "number"
      ? `${report.improvement_percent >= 0 ? "+" : ""}${report.improvement_percent.toFixed(1)}%`
      : "Not assessed";

  return (
    <Panel
      action={
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <BarChart3 aria-hidden="true" className="h-4 w-4" />
        </span>
      }
      description={`Same benchmark report · ${report.records.toLocaleString()} input records · ${report.repetitions} repetitions`}
      title="Pipeline performance"
    >
      <PerformanceBars
        baseline={report.baseline.median_seconds}
        optimized={report.optimized.median_seconds}
      />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Observed change</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{improvement}</p>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            report.equivalent
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
          }`}
        >
          {report.equivalent ? (
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {report.equivalent ? "Outputs equivalent" : "Outputs differ"}
        </div>
      </div>
      {inconclusive && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Performance improvement is not assessed for a benchmark with fewer than two repetitions.
        </p>
      )}
      {!report.equivalent && (
        <p className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
          Durations are shown for context only. Output equivalence failed, so no improvement claim is made.
        </p>
      )}
    </Panel>
  );
}
