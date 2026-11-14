import { Check, CircleAlert, FlaskConical } from "lucide-react";
import type { BenchmarkWidgetData } from "../../types/dashboard";
import { formatSeconds } from "../../lib/dashboardMetrics";
import { EmptyState, ErrorState, LoadingState } from "../common/States";
import { Panel } from "../common/Panel";

export function BenchmarkSummary({ data }: { data: BenchmarkWidgetData }) {
  if (data.status === "loading") {
    return (
      <Panel title="Latest benchmark">
        <LoadingState label="Loading benchmark report" />
      </Panel>
    );
  }
  if (data.status === "error") {
    return (
      <Panel title="Latest benchmark">
        <ErrorState description={data.message ?? "Benchmark report could not be loaded."} />
      </Panel>
    );
  }
  if (!data.report) {
    return (
      <Panel title="Latest benchmark">
        <EmptyState
          description="Benchmark details will be shown after a report is available."
          title="No benchmark report available"
        />
      </Panel>
    );
  }

  const report = data.report;
  const inconclusive =
    report.performance_assessment === "insufficient_repetitions" ||
    report.repetitions < 2;
  const improvement =
    report.equivalent && !inconclusive && report.improvement_percent !== null
      ? `${report.improvement_percent >= 0 ? "+" : ""}${report.improvement_percent.toFixed(1)}%`
      : "Not assessed";

  return (
    <Panel
      icon={<FlaskConical aria-hidden="true" className="h-4 w-4" />}
      title="Latest benchmark"
      description={report.performance_assessment.replaceAll("_", " ")}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Dataset records</dt>
          <dd className="mt-1 font-semibold tabular-nums">{report.records.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Repetitions</dt>
          <dd className="mt-1 font-semibold tabular-nums">{report.repetitions}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Baseline median</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {formatSeconds(report.baseline.median_seconds)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Optimized median</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {formatSeconds(report.optimized.median_seconds)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Observed change</p>
          <p className="mt-1 text-base font-semibold tabular-nums">{improvement}</p>
        </div>
        <span
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
        </span>
      </div>
      {inconclusive && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          A single repetition is insufficient to assess performance improvement.
        </p>
      )}
    </Panel>
  );
}
