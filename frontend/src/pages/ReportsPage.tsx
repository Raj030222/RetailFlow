import { Archive, RefreshCw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { ReportCatalogList, type ReportFilters } from "../components/reports/ReportCatalogList";
import { ReportDetails } from "../components/reports/ReportDetails";
import { PageHeader } from "../components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../components/common/States";
import { Button } from "../components/ui/button";
import { useReportsCatalog } from "../hooks/useReportsCatalog";
import { downloadReportContent } from "../services/reportDownloads";
import type { ReportCatalogEntry } from "../types/reports";

const INITIAL_FILTERS: ReportFilters = {
  category: "all",
  format: "all",
  query: "",
  timeOrder: "newest",
};

function timestampValue(entry: ReportCatalogEntry): number | null {
  if (!entry.generatedAt) return null;
  const parsed = Date.parse(entry.generatedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold tracking-tight" title={value}>
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div
      aria-label="Loading report summary"
      className="animate-pulse rounded-lg border border-border bg-card p-4"
      role="status"
    >
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="mt-3 h-6 w-20 rounded bg-muted" />
      <div className="mt-2 h-3 w-32 rounded bg-muted" />
    </div>
  );
}

function ReportLoadSkeleton() {
  return (
    <div
      aria-label="Loading report catalog"
      className="space-y-3 rounded-lg border border-border bg-card p-5"
      role="status"
    >
      <LoadingState label="Loading persisted reports and job references…" />
      {Array.from({ length: 4 }, (_, index) => (
        <div className="h-16 animate-pulse rounded bg-muted" key={index} />
      ))}
    </div>
  );
}

export function ReportsPage() {
  const catalog = useReportsCatalog();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const filteredEntries = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase();
    return catalog.entries
      .filter((entry) => filters.category === "all" || entry.category === filters.category)
      .filter((entry) => filters.format === "all" || entry.format === filters.format)
      .filter((entry) => {
        if (!query) return true;
        return [
          entry.name,
          entry.category,
          entry.format,
          entry.batchId,
          entry.runId,
          entry.jobId,
          entry.reportStatus,
        ]
          .filter((value): value is string => value !== null)
          .some((value) => value.toLocaleLowerCase().includes(query));
      })
      .sort((left, right) => {
        const leftTimestamp = timestampValue(left);
        const rightTimestamp = timestampValue(right);
        if (leftTimestamp === null && rightTimestamp === null) {
          return left.name.localeCompare(right.name);
        }
        if (leftTimestamp === null) return 1;
        if (rightTimestamp === null) return -1;
        return filters.timeOrder === "newest"
          ? rightTimestamp - leftTimestamp
          : leftTimestamp - rightTimestamp;
      });
  }, [catalog.entries, filters]);

  const availableCount = catalog.entries.filter(
    (entry) => entry.available === "available",
  ).length;
  const verifiedCount = catalog.entries.filter(
    (entry) => entry.associationVerified && entry.jobId,
  ).length;
  const validationOutput = catalog.selectedEntry?.jobId
    ? catalog.validationOutputs.get(catalog.selectedEntry.jobId)
    : undefined;

  const download = (entry: ReportCatalogEntry, content: string) => {
    if (!entry.fileName) return;
    downloadReportContent(entry.fileName, entry.format, content);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={catalog.refreshing}
              onClick={() => void catalog.refresh()}
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${catalog.refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        }
        description="Browse run metrics, data-quality results, and benchmark artifacts returned by the RetailFlow API. Every job link is separated from report status and shown only when its association is supported."
        eyebrow="Data observability"
        title="Reports & Exports"
      />

      <section
        aria-label="Report catalog summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {catalog.status === "loading" && catalog.entries.length === 0 ? (
          Array.from({ length: 4 }, (_, index) => <SummarySkeleton key={index} />)
        ) : (
          <>
            <SummaryCard
              detail="Includes unavailable references from loaded job history"
              label="Catalog entries"
              value={catalog.entries.length.toLocaleString()}
            />
            <SummaryCard
              detail="Content returned by the API or loaded from selected job logs"
              label="Available now"
              value={availableCount.toLocaleString()}
            />
            <SummaryCard
              detail="Pipeline timing verified or validation output belongs to its persisted job"
              label="Verified job links"
              value={verifiedCount.toLocaleString()}
            />
            <SummaryCard
              detail={
                catalog.lastUpdated
                  ? `Job history refreshed ${catalog.lastUpdated.toLocaleString()}`
                  : "No refresh timestamp available"
              }
              label="Job history"
              value={catalog.status === "error" ? "Unavailable" : catalog.status}
            />
          </>
        )}
      </section>

      {catalog.error && (
        <ErrorState
          description={catalog.error}
          title="Job history could not be loaded"
        />
      )}
      {catalog.benchmarkError && (
        <ErrorState
          description={catalog.benchmarkError}
          title="Benchmark reports could not be loaded"
        />
      )}

      {catalog.status === "loading" && catalog.jobs.length === 0 ? (
        <ReportLoadSkeleton />
      ) : catalog.entries.length === 0 ? (
        <EmptyState
          description={
            catalog.status === "error"
              ? "No report data could be loaded. Check the API connection and refresh."
              : "There are no reports or report references in the loaded job history. Reports are not synthesized from pipeline structure."
          }
          title={
            catalog.status === "error"
              ? "Report catalog unavailable"
              : "No reports available"
          }
          action={
            <Button onClick={() => void catalog.refresh()} variant="outline">
              Refresh report catalog
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <ReportCatalogList
              entries={filteredEntries}
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(INITIAL_FILTERS)}
              onSelect={catalog.selectEntry}
              selectedId={catalog.selectedEntryId}
            />
            <ReportDetails
              entry={catalog.selectedEntry}
              onDownload={download}
              selectedJob={catalog.selectedJob}
              validationOutput={validationOutput}
            />
          </div>

          {catalog.hasMore && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <p className="text-xs leading-5 text-muted-foreground">
                The catalog currently includes the latest {catalog.jobs.length.toLocaleString()} persisted jobs. Older records are fetched in pages; no total history count is exposed.
              </p>
              <Button
                disabled={catalog.loadingMore}
                onClick={() => void catalog.loadMore()}
                variant="outline"
              >
                {catalog.loadingMore ? (
                  <LoadingState label="Loading older jobs…" />
                ) : (
                  <>
                    <Archive aria-hidden="true" className="h-3.5 w-3.5" />
                    Load older reports
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}

      <section className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card">
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Report availability and retention</h2>
        </div>
        <div className="mt-4 grid gap-4 text-xs leading-5 text-muted-foreground md:grid-cols-2">
          <p>
            Run metrics and reconciliation are batch-keyed API reports and may be overwritten or removed. A historical job is linked only when batch ID, mode, and report timestamps fit that job&apos;s recorded execution window. Missing matches remain unverified.
          </p>
          <p>
            Benchmark reports use fixed filenames and expose no report timestamp or producing job ID. Validation output is read from the selected job&apos;s persisted logs; it is not a separate report file. The API returns parsed content rather than original file bytes, so exports are snapshots and may be normalized.
          </p>
        </div>
      </section>
    </div>
  );
}
