import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportPreview } from "./ReportPreview";
import type { ReportCatalogEntry } from "../../types/reports";

function entry(
  overrides: Partial<ReportCatalogEntry>,
): ReportCatalogEntry {
  return {
    id: "benchmark-csv",
    name: "benchmark_results.csv",
    category: "Benchmark",
    format: "CSV",
    previewKind: "csv",
    sourceKind: "benchmark",
    fileName: "benchmark_results.csv",
    available: "available",
    content: "",
    generatedAt: null,
    batchId: null,
    runId: null,
    jobId: null,
    jobStatus: null,
    jobType: null,
    reportStatus: null,
    associationVerified: false,
    message: null,
    ...overrides,
  };
}

describe("ReportPreview", () => {
  it("supports full CSV previews with page navigation", () => {
    const csv = [
      "name,value",
      ...Array.from({ length: 26 }, (_, index) => `row-${index + 1},${index + 1}`),
    ].join("\n");
    render(<ReportPreview entry={entry({ content: csv })} />);

    expect(screen.getByText("26 data rows · showing 1–25")).toBeInTheDocument();
    expect(screen.getByText("row-1")).toBeInTheDocument();
    expect(screen.queryByText("row-26")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("26 data rows · showing 26–26")).toBeInTheDocument();
    expect(screen.getByText("row-26")).toBeInTheDocument();
  });

  it("reports malformed CSV instead of rendering a partial preview", () => {
    render(<ReportPreview entry={entry({ content: '"unterminated' })} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "CSV contains an unterminated quoted field.",
    );
  });

  it("renders JSON as expandable data, not executable markup", () => {
    render(
      <ReportPreview
        entry={entry({
          content: { status: "PASS", nested: { count: 3 } },
          format: "JSON",
          previewKind: "json",
        })}
      />,
    );
    expect(screen.getByLabelText("Expandable JSON preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Expandable JSON preview")).toHaveTextContent(
      '"PASS"',
    );
    expect(screen.getByText("count")).toBeInTheDocument();
  });

  it("shows Markdown as text so embedded HTML is not executed", () => {
    const { container } = render(
      <ReportPreview
        entry={entry({
          content: "# Result\n\n<script>alert(1)</script>",
          format: "Markdown",
          previewKind: "markdown",
        })}
      />,
    );
    expect(container.querySelector("pre")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    expect(container.querySelector("script")).toBeNull();
  });
});
