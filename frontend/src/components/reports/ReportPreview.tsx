import { useMemo, useState } from "react";
import { parseCsvContent } from "../../lib/reportContent";
import type { ValidationOutputLookup } from "../../lib/reportCatalog";
import type { ReportCatalogEntry } from "../../types/reports";

function JsonValue({
  label,
  value,
  depth = 0,
}: {
  label: string;
  value: unknown;
  depth?: number;
}) {
  if (Array.isArray(value)) {
    return (
      <details className="min-w-0" open={depth === 0}>
        <summary className="cursor-pointer rounded px-1 py-0.5 hover:bg-muted">
          <span className="font-medium">{label}</span>
          <span className="ml-2 text-muted-foreground">[{value.length}]</span>
        </summary>
        <div className="ml-4 border-l border-border pl-2">
          {value.map((item, index) => (
            <JsonValue
              depth={depth + 1}
              key={index}
              label={String(index)}
              value={item}
            />
          ))}
        </div>
      </details>
    );
  }
  if (typeof value === "object" && value !== null) {
    const fields = Object.entries(value);
    return (
      <details className="min-w-0" open={depth === 0}>
        <summary className="cursor-pointer rounded px-1 py-0.5 hover:bg-muted">
          <span className="font-medium">{label}</span>
          <span className="ml-2 text-muted-foreground">{`{${fields.length}}`}</span>
        </summary>
        <div className="ml-4 border-l border-border pl-2">
          {fields.map(([key, item]) => (
            <JsonValue depth={depth + 1} key={key} label={key} value={item} />
          ))}
        </div>
      </details>
    );
  }
  return (
    <div className="break-all px-1 py-0.5">
      <span className="font-medium">{label}</span>
      <span className="mx-1 text-muted-foreground">:</span>
      <span className="text-muted-foreground">{JSON.stringify(value) ?? "undefined"}</span>
    </div>
  );
}

function JsonPreview({ content }: { content: unknown }) {
  return (
    <div
      aria-label="Expandable JSON preview"
      className="max-h-[34rem] space-y-1 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-5"
    >
      <JsonValue label="Report" value={content} />
    </div>
  );
}

function CsvPreview({ content }: { content: string }) {
  const [page, setPage] = useState(0);
  const parsed = useMemo(() => {
    try {
      return { result: parseCsvContent(content), error: null };
    } catch (error) {
      return {
        result: null,
        error:
          error instanceof Error
            ? error.message
            : "CSV preview could not be parsed.",
      };
    }
  }, [content]);
  const pageSize = 25;

  if (parsed.error || !parsed.result) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {parsed.error ?? "CSV preview is unavailable."}
      </p>
    );
  }
  const { headers, rows } = parsed.result;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );
  const firstRow = rows.length === 0 ? 0 : currentPage * pageSize + 1;
  const lastRow = Math.min((currentPage + 1) * pageSize, rows.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {rows.length.toLocaleString()} data rows · showing{" "}
          {firstRow.toLocaleString()}–{lastRow.toLocaleString()}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-50"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              type="button"
            >
              Previous
            </button>
            <span>
              Page {currentPage + 1} of {pageCount}
            </span>
            <button
              className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-50"
              disabled={currentPage + 1 >= pageCount}
              onClick={() => setPage(currentPage + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        )}
      </div>
      {headers.length === 0 ? (
        <p className="text-sm text-muted-foreground">The CSV has no rows.</p>
      ) : (
        <div className="max-h-[34rem] overflow-auto rounded-md border border-border">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                {headers.map((header, index) => (
                  <th className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold" key={`${header}-${index}`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr className="odd:bg-card even:bg-muted/20" key={currentPage * pageSize + rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td className="max-w-64 break-words border-b border-border px-3 py-2 align-top" key={cellIndex}>
                      {cell || <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ReportPreview({
  entry,
  validationOutput,
}: {
  entry: ReportCatalogEntry;
  validationOutput?: ValidationOutputLookup;
}) {
  if (
    entry.sourceKind === "validation-job" &&
    validationOutput?.state === "loading"
  ) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading persisted validation output…
      </p>
    );
  }
  if (
    entry.sourceKind === "validation-job" &&
    validationOutput?.state === "error"
  ) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {validationOutput.message}
      </p>
    );
  }
  if (entry.available === "on-demand") {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Select this validation result to load its persisted job logs.
      </p>
    );
  }
  if (entry.available === "unavailable") {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        No preview is available because this report content was not returned by the API.
      </p>
    );
  }
  if (entry.previewKind === "json") {
    return <JsonPreview content={entry.content} />;
  }
  if (entry.previewKind === "csv") {
    return typeof entry.content === "string" ? (
      <CsvPreview content={entry.content} />
    ) : (
      <p className="text-sm text-muted-foreground">CSV content is unavailable.</p>
    );
  }
  if (entry.previewKind === "markdown") {
    return (
      <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-4 text-xs leading-6">
        {typeof entry.content === "string"
          ? entry.content
          : "Markdown content is unavailable."}
      </pre>
    );
  }
  if (entry.previewKind === "validation") {
    return typeof entry.content === "string" ? (
      <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-4 text-xs leading-5">
        {entry.content}
      </pre>
    ) : (
      <JsonPreview content={entry.content} />
    );
  }
  return null;
}
