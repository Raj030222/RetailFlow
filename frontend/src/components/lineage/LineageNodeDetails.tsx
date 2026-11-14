import type { JobRecord } from "../../types/jobs";
import type {
  AssociatedRunReport,
  LineageNode,
  RunReportState,
} from "../../types/lineage";

function Value({ children }: { children: React.ReactNode }) {
  return (
    <dd className="mt-1 break-words text-sm text-foreground">
      {children ?? <span className="text-muted-foreground">Unavailable</span>}
    </dd>
  );
}

function MetadataList({
  label,
  values,
}: {
  label: string;
  values: string[] | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">
        {values?.length ? values.join(", ") : "Unavailable"}
      </dd>
    </div>
  );
}

function outputPathPattern(node: LineageNode, job: JobRecord | null): string {
  if (job?.job_type === "both") {
    return `outputs/{mode}/runs/{batch_id}/${node.name}`;
  }
  return `outputs/runs/{batch_id}/${node.name}`;
}

function reportsForOutput(
  node: LineageNode,
  reports: AssociatedRunReport[],
): AssociatedRunReport[] {
  if (node.id !== "output-processed_transactions") return [];
  return reports;
}

export function LineageNodeDetails({
  node,
  selectedJob,
  reports,
  reportState,
  reportMessage,
}: {
  node: LineageNode;
  selectedJob: JobRecord | null;
  reports: AssociatedRunReport[];
  reportState: RunReportState;
  reportMessage: string | null;
}) {
  const runReports = reportsForOutput(node, reports);
  const isOutput = node.kind === "output";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {node.kind === "stage"
            ? "Transformation stage"
            : `${node.kind} dataset`}
        </p>
        <h3 className="mt-1 break-words text-base font-semibold">{node.name}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {node.description}
        </p>
      </div>

      {node.kind === "source" && (
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Dataset name</dt>
            <Value>{node.name.replace(/\.csv$/i, "")}</Value>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">File path</dt>
            <Value><code className="text-xs">{node.filePath}</code></Value>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">File format</dt>
            <Value>{node.format}</Value>
          </div>
          <MetadataList label="CSV columns (explicit schema)" values={node.columns} />
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Record count</dt>
            <Value>Not reported by the lineage API</Value>
          </div>
        </dl>
      )}

      {node.kind === "stage" && (
        <dl className="space-y-3">
          <MetadataList label="Input datasets" values={node.inputDatasets} />
          <MetadataList label="Output datasets" values={node.outputDatasets} />
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Source code reference</dt>
            <Value><code className="text-xs">{node.codeReference}</code></Value>
          </div>
          <p className="rounded-md bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
            Stage-level execution status and duration are not exposed. The selected job status is separate from this static stage description.
          </p>
        </dl>
      )}

      {isOutput && (
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Output name</dt>
            <Value>{node.name}</Value>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Format</dt>
            <Value>{node.format}</Value>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              {reports.length > 0 ? "Output path" : "Configured path pattern"}
            </dt>
            {reports.length > 0 ? (
              <dd className="mt-1 space-y-1 break-words font-mono text-xs text-foreground">
                {reports.map((report) => (
                  <p key={`${report.mode}-${report.batchId}`}>
                    <span className="font-sans text-muted-foreground">
                      {report.publicationTarget ? "Published" : "Configured pattern"}:{" "}
                    </span>
                    {report.publicationTarget
                      ? `${report.publicationTarget}/${node.name}`
                      : outputPathPattern(node, selectedJob)}
                    {reports.length > 1 ? ` (${report.mode})` : ""}
                  </p>
                ))}
              </dd>
            ) : (
              <Value><code className="text-xs">{outputPathPattern(node, selectedJob)}</code></Value>
            )}
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Record count</dt>
            {node.id === "output-processed_transactions" && runReports.length > 0 ? (
              <dd className="mt-1 space-y-1 text-sm text-foreground">
                {runReports.map((report) => (
                  <p key={`${report.mode}-${report.batchId}`}>
                    {report.outputRecords === null
                      ? "Not reported"
                      : report.outputRecords.toLocaleString()}
                    {reports.length > 1 ? ` (${report.mode})` : ""}
                  </p>
                ))}
              </dd>
            ) : (
              <Value>Not reported per dataset</Value>
            )}
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Producing run ID</dt>
            {reports.length > 0 ? (
              <dd className="mt-1 space-y-1 break-all font-mono text-xs text-foreground">
                {reports.map((report) => (
                  <p key={`${report.mode}-${report.batchId}`}>
                    {report.runId ?? "Unavailable"}
                    {reports.length > 1 ? ` (${report.mode})` : ""}
                  </p>
                ))}
              </dd>
            ) : (
              <Value>Unavailable</Value>
            )}
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Publication status</dt>
            {reports.length > 0 ? (
              <dd className="mt-1 space-y-1 text-sm text-foreground">
                {reports.map((report) => (
                  <p key={`${report.mode}-${report.batchId}`}>
                    {report.publicationState ?? report.pipelineStatus ?? "Not reported"}
                    {reports.length > 1 ? ` (${report.mode})` : ""}
                  </p>
                ))}
              </dd>
            ) : (
              <Value>
                {reportState === "loading"
                  ? "Loading run report…"
                  : "Unavailable"}
              </Value>
            )}
          </div>
          {reportMessage && reports.length === 0 && (
            <p className="rounded-md bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              {reportMessage}
            </p>
          )}
        </dl>
      )}
    </div>
  );
}
