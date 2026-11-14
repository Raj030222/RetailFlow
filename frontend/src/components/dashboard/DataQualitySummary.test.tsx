import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QualityWidgetData } from "../../types/dashboard";
import { DataQualitySummary } from "./DataQualitySummary";

describe("DataQualitySummary", () => {
  it("labels reconciliation status separately from validation quality", () => {
    const data: QualityWidgetData = {
      status: "ready",
      source: "reconciliation",
      report: {
        status: "PASS",
        input_records: 10,
        valid_records: 10,
        rejected_records: 0,
        duplicate_records: 0,
      },
    };

    render(<DataQualitySummary data={data} />);

    expect(
      screen.getByRole("heading", { name: "Pipeline reconciliation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reconciliation PASS")).toBeInTheDocument();
    expect(
      screen.getByText(/does not represent validation quality/i),
    ).toBeInTheDocument();
  });

  it("keeps validation failure reports under the data quality heading", () => {
    const data: QualityWidgetData = {
      status: "ready",
      source: "validation",
      report: { status: "FAIL", error: "Validation failed" },
    };

    render(<DataQualitySummary data={data} />);

    expect(screen.getByRole("heading", { name: "Data quality" })).toBeInTheDocument();
    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.queryByText("Validation FAIL")).not.toBeInTheDocument();
  });
});
