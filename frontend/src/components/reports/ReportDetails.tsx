import { Download, ExternalLink, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { formatTimestamp } from "../../lib/dashboardMetrics";
import { ReportPreview } from "./ReportPreview";
import type {
  ValidationOutputLookup,
} from "../../lib/reportCatalog";
import type { ReportCatalogEntry } from "../../types/reports";
import { Button } from "../ui/button";

type SelectedJobState =
  | { status: "idle" }
  | { status: "loading"; jobId: string }
  | { status: "ready"; job: { job_id: string; status: string } }
  | { status: "error"; jobId: string; message: string };

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-xs">{value}</dd>
    </div>
  );
}

function downloadableContent(entry: ReportCatalogEntry): string | null {
  if (entry.available !== "available" || entry.fileName === null) return null;
  if (entry.format === "JSON") {
    try {
      return JSON.stringify(entry.content, null, 2);
    } catch {
      return null;
    }
  }
  if (
    (entry.format === "CSV" || entry.format === "Markdown") &&
    typeof entry.content === "string"
  ) {
    return entry.content;
  }
  return null;
}

export function ReportDetails({
  entry,
  selectedJob,
  validationOutput,
  onDownload,
}: {
  entry: ReportCatalogEntry | null;
  selectedJob: SelectedJobState;
  validationOutput: ValidationOutputLookup | undefined;
  onDownload: (entry: ReportCatalogEntry, content: string) => void;
}) {
  if (!entry) {
    return (
      <section
        aria-label="Report details"
        className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-card"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileText aria-hidden="true" className="h-4 w-4" />
          Report details
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Select an item from the catalog to inspect its available metadata and content.
        </p>
      </section>
    );
  }

  const content = downloadableContent(entry);
  const jobStatus =
    selectedJob.status === "ready" && selectedJob.job.job_id === entry.jobId
      ? selectedJob.job.status
      : entry.jobStatus ?? "Not available";
  const validationLoading =
    entry.sourceKind === "validation-job" &&
    validationOutput?.state === "loading";
  const validationError =
    entry.sourceKind === "validation-job" &&
    validationOutput?.state === "error"
      ? validationOutput.message
      : null;

  return (
    <section
      aria-label="Report details"
      className="min-w-0 rounded-lg border border-border bg-card text-card-foreground shadow-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
            <h2 className="break-all">{entry.name}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.category} · {entry.format}
          </p>
        </div>
        {content !== null && entry.fileName && (
          <Button
            onClick={() => onDownload(entry, content)}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            Export snapshot
          </Button>
        )}
      </header>

      <div className="space-y-5 p-5">
        <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          <MetadataItem label="Availability" value={entry.available} />
          <MetadataItem
            label={
              entry.category === "Benchmark"
                ? "Benchmark assessment"
                : "Report status"
            }
            value={entry.reportStatus ?? "Not reported"}
          />
          <MetadataItem label="Pipeline batch ID" value={entry.batchId ?? "Not exposed"} />
          <MetadataItem label="Run ID" value={entry.runId ?? "Not exposed"} />
          <MetadataItem
            label="Report timestamp"
            value={
              entry.generatedAt
                ? formatTimestamp(entry.generatedAt)
                : "Not exposed by this API"
            }
          />
          <MetadataItem label="Execution status" value={jobStatus} />
          <MetadataItem label="Producing job ID" value={entry.jobId ?? "Not verified"} />
          <MetadataItem
            label="Association"
            value={entry.associationVerified ? "Verified" : "Unavailable"}
          />
        </dl>

        {entry.message && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            {entry.message}
          </p>
        )}
        {selectedJob.status === "loading" &&
          selectedJob.jobId === entry.jobId && (
            <p className="text-xs text-muted-foreground" role="status">
              Refreshing selected job details…
            </p>
          )}
        {selectedJob.status === "error" &&
          selectedJob.jobId === entry.jobId && (
            <p className="text-xs text-destructive" role="alert">
              {selectedJob.message}
            </p>
          )}
        {validationLoading && (
          <p className="text-xs text-muted-foreground" role="status">
            Loading persisted validation output…
          </p>
        )}
        {validationError && (
          <p className="text-xs text-destructive" role="alert">
            {validationError}
          </p>
        )}

        {entry.associationVerified && entry.jobId && (
          <Link
            className="inline-flex items-center gap-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
            to={`/history?jobId=${encodeURIComponent(entry.jobId)}`}
          >
            View verified job in Run History
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        )}

        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-xs font-semibold">Content preview</h3>
          <ReportPreview entry={entry} validationOutput={validationOutput} />
        </div>

        {content !== null && (
          <p className="text-[11px] leading-5 text-muted-foreground">
            Exports are generated from content returned by the API. They are snapshots, not guaranteed byte-identical copies of stored files.
          </p>
        )}
      </div>
    </section>
  );
}
