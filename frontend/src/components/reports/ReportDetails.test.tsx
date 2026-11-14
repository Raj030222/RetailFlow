import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportDetails } from "./ReportDetails";
import type { ReportCatalogEntry } from "../../types/reports";

function entry(
  format: ReportCatalogEntry["format"],
  content: ReportCatalogEntry["content"],
): ReportCatalogEntry {
  return {
    id: "sample-report",
    name: "sample-report",
    category: "Benchmark",
    format,
    previewKind:
      format === "JSON"
        ? "json"
        : format === "CSV"
          ? "csv"
          : format === "Markdown"
            ? "markdown"
            : "unavailable",
    sourceKind: "benchmark",
    fileName:
      format === "JSON"
        ? "benchmark_results.json"
        : format === "CSV"
          ? "benchmark_results.csv"
          : "performance_report.md",
    available: format === "Not available" ? "unavailable" : "available",
    content,
    generatedAt: null,
    batchId: null,
    runId: null,
    jobId: null,
    jobStatus: null,
    jobType: null,
    reportStatus: null,
    associationVerified: false,
    message: null,
  };
}

describe("ReportDetails exports", () => {
  it.each([
    {
      format: "JSON" as const,
      content: { status: "PASS", count: 2 },
      expected: '{\n  "status": "PASS",\n  "count": 2\n}',
    },
    {
      format: "CSV" as const,
      content: "name,value\nrow-1,2",
      expected: "name,value\nrow-1,2",
    },
    {
      format: "Markdown" as const,
      content: "# Benchmark\n\nEquivalent outputs: true.",
      expected: "# Benchmark\n\nEquivalent outputs: true.",
    },
  ])("exports the API's $format content", ({ format, content, expected }) => {
    const onDownload = vi.fn();
    render(
      <ReportDetails
        entry={entry(format, content)}
        selectedJob={{ status: "idle" }}
        validationOutput={undefined}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export snapshot" }));

    expect(onDownload).toHaveBeenCalledWith(entry(format, content), expected);
  });

  it("does not offer an export when report content is unavailable", () => {
    render(
      <ReportDetails
        entry={entry("Not available", null)}
        selectedJob={{ status: "idle" }}
        validationOutput={undefined}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Export snapshot" })).toBeNull();
    expect(
      screen.getByText(
        "No preview is available because this report content was not returned by the API.",
      ),
    ).toBeInTheDocument();
  });
});
