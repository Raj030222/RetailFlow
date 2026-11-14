import { Activity, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { BenchmarkExecutionCard } from "../components/pipeline/BenchmarkExecutionCard";
import { DatasetGenerationCard } from "../components/pipeline/DatasetGenerationCard";
import { JobMonitor } from "../components/pipeline/JobMonitor";
import { PipelineRunCard } from "../components/pipeline/PipelineRunCard";
import { ValidationJobCard } from "../components/pipeline/ValidationJobCard";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { Button } from "../components/ui/button";
import { usePipelineJobs } from "../hooks/usePipelineJobs";
import { formatTimestamp } from "../lib/dashboardMetrics";

export function PipelineExecutionPage() {
  const monitor = usePipelineJobs();
  const activeCount = useMemo(
    () => monitor.jobs.filter((job) => job.status === "queued" || job.status === "running").length,
    [monitor.jobs],
  );
  const inspectJob = (jobId: string) => {
    monitor.selectJob(jobId);
    window.setTimeout(
      () => document.getElementById("job-monitor")?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
      0,
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden text-[11px] text-muted-foreground md:inline">
              Updated {formatTimestamp(monitor.lastUpdated?.toISOString() ?? null)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
              <Activity aria-hidden="true" className="h-3.5 w-3.5" />
              {activeCount} active in loaded jobs
            </span>
            <Button
              disabled={monitor.refreshing}
              onClick={() => void monitor.refresh()}
              variant="outline"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${monitor.refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
        description="Configure, execute, and monitor RetailFlow data engineering workflows."
        eyebrow="Operations"
        title="Pipeline Execution"
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <DatasetGenerationCard
          isDuplicateActive={monitor.isDuplicateActive}
          jobs={monitor.jobs}
          onInspect={inspectJob}
          submitOnce={monitor.submitOnce}
        />
        <ValidationJobCard
          isDuplicateActive={monitor.isDuplicateActive}
          jobs={monitor.jobs}
          onInspect={inspectJob}
          submitOnce={monitor.submitOnce}
        />
      </div>

      <section aria-labelledby="pipeline-modes-heading" className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold" id="pipeline-modes-heading">Pipeline execution modes</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Each submission is confirmed before it enters the API’s serialized single-worker queue.
          </p>
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {(["baseline", "optimized", "both"] as const).map((mode) => (
            <PipelineRunCard
              isDuplicateActive={monitor.isDuplicateActive}
              jobs={monitor.jobs}
              key={mode}
              mode={mode}
              onInspect={inspectJob}
              submitOnce={monitor.submitOnce}
            />
          ))}
        </div>
      </section>

      <BenchmarkExecutionCard
        isDuplicateActive={monitor.isDuplicateActive}
        jobs={monitor.jobs}
        onInspect={inspectJob}
        submitOnce={monitor.submitOnce}
      />

      <Panel
        className="border-primary/20 bg-primary/[0.025]"
        description="Job history and active counts are limited to the records loaded from the API. Older jobs can be loaded in offset-based pages, but the API does not expose a total count."
        title="Queue and history behavior"
      >
        <p className="text-xs leading-5 text-muted-foreground">
          Generate, validate, baseline, optimized, both, and benchmark operations share one persistent API queue and run one at a time. Active counts shown above are for the visible history only. Exact duplicate prevention applies to matching requests submitted from this page while they remain active; the API does not expose prior request payloads for matching work submitted elsewhere.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Last job list refresh: {formatTimestamp(monitor.lastUpdated?.toISOString() ?? null)}
        </p>
      </Panel>

      <div id="job-monitor" className="scroll-mt-24">
        <JobMonitor
          detailsLoading={monitor.detailsLoading}
          error={monitor.error}
          jobs={monitor.jobs}
          lastUpdated={monitor.lastUpdated}
          logsError={monitor.logsError}
          logsTruncated={monitor.logsTruncated}
          refresh={monitor.refresh}
          refreshing={monitor.refreshing}
          hasMore={monitor.hasMore}
          loadMore={monitor.loadMore}
          loadingMore={monitor.loadingMore}
          selectJob={monitor.selectJob}
          selectedJob={monitor.selectedJob}
          selectedJobId={monitor.selectedJobId}
          status={monitor.status}
          stderr={monitor.stderr}
          stdout={monitor.stdout}
        />
      </div>
    </div>
  );
}
