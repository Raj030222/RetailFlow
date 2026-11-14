import { Search } from "lucide-react";
import { formatTimestamp } from "../../lib/dashboardMetrics";
import type { ReportCatalogEntry } from "../../types/reports";
import { Button } from "../ui/button";

const categories = ["Pipeline Execution", "Data Quality", "Benchmark"] as const;
const formats = ["JSON", "CSV", "Markdown", "Job logs", "Not available"] as const;

export interface ReportFilters {
  category: string;
  format: string;
  query: string;
  timeOrder: "newest" | "oldest";
}

function availabilityLabel(entry: ReportCatalogEntry): string {
  if (entry.available === "available") return "Available";
  if (entry.available === "on-demand") return "Loads on selection";
  return "Unavailable";
}

export function ReportCatalogList({
  entries,
  filters,
  selectedId,
  onChange,
  onReset,
  onSelect,
}: {
  entries: ReportCatalogEntry[];
  filters: ReportFilters;
  selectedId: string | null;
  onChange: (filters: ReportFilters) => void;
  onReset: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section
      aria-label="Report catalog"
      className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-card"
    >
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">Report catalog</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Only reports and references returned by the existing API are listed.
        </p>
        <div
          aria-label="Report filters"
          className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2"
          role="group"
        >
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-muted-foreground">
            Category
            <select
              aria-label="Filter reports by category"
              className="h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) =>
                onChange({ ...filters, category: event.target.value })
              }
              value={filters.category}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-muted-foreground">
            Format
            <select
              aria-label="Filter reports by format"
              className="h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) =>
                onChange({ ...filters, format: event.target.value })
              }
              value={filters.format}
            >
              <option value="all">All formats</option>
              {formats.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-muted-foreground">
            Timestamp order
            <select
              aria-label="Sort reports by timestamp"
              className="h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) =>
                onChange({
                  ...filters,
                  timeOrder: event.target.value as ReportFilters["timeOrder"],
                })
              }
              value={filters.timeOrder}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <div className="flex items-end justify-end">
            <Button
              disabled={
                filters.category === "all" &&
                filters.format === "all" &&
                !filters.query &&
                filters.timeOrder === "newest"
              }
              onClick={onReset}
              size="sm"
              variant="outline"
            >
              Clear filters
            </Button>
          </div>
          <label className="min-w-0 space-y-1.5 text-xs font-medium text-muted-foreground sm:col-span-2">
            Search reports
            <span className="relative block min-w-0">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                aria-label="Search report catalog"
                className="h-10 min-w-0 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) =>
                  onChange({ ...filters, query: event.target.value })
                }
                placeholder="Search reports, jobs, or batches"
                type="search"
                value={filters.query}
              />
            </span>
          </label>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">
          No reports match the selected filters.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                aria-pressed={selectedId === entry.id}
                className={`w-full px-5 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  selectedId === entry.id ? "bg-accent/70" : ""
                }`}
                onClick={() => onSelect(entry.id)}
                type="button"
              >
                <span className="flex flex-wrap items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block break-all text-sm font-medium">
                      {entry.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {entry.category} · {entry.format}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${
                      entry.available === "available"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {availabilityLabel(entry)}
                  </span>
                </span>
                <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    Updated:{" "}
                    {entry.generatedAt
                      ? formatTimestamp(entry.generatedAt)
                      : "Not exposed"}
                  </span>
                  {entry.jobId && <span>Job: {entry.jobId}</span>}
                  {entry.batchId && <span>Batch: {entry.batchId}</span>}
                  {entry.reportStatus && (
                    <span>
                      {entry.category === "Benchmark"
                        ? "Benchmark assessment"
                        : "Report status"}
                      : {entry.reportStatus}
                    </span>
                  )}
                  {entry.jobStatus && <span>Job status: {entry.jobStatus}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
