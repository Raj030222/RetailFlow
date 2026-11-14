import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useDashboardData", () => ({ useDashboardData: vi.fn() }));
vi.mock("../hooks/usePipelineJobs", () => ({ usePipelineJobs: vi.fn() }));
vi.mock("../components/pipeline/BenchmarkExecutionCard", () => ({
  BenchmarkExecutionCard: () => <div>Benchmark controls</div>,
}));

import { useDashboardData } from "../hooks/useDashboardData";
import { usePipelineJobs } from "../hooks/usePipelineJobs";
import type { BenchmarkReport } from "../types/jobs";
import { PerformancePage } from "./PerformancePage";

const report: BenchmarkReport = {
  baseline: { median_seconds: 10, output_records: 10, output_counts: {}, plan: "base" },
  optimized: { median_seconds: 5, output_records: 10, output_counts: {}, plan: "optimized" },
  equivalent: false,
  records: 10,
  repetitions: 3,
  improvement_percent: 50,
  performance_assessment: "observed_only",
  performance_note: "Local measurements",
};

function configurePage(selectedReport: BenchmarkReport) {
  vi.mocked(useDashboardData).mockReturnValue({
    data: {
      jobs: { status: "ready", jobs: [] },
      benchmark: { status: "ready", report: selectedReport },
      quality: { status: "ready", source: null, report: null },
      lastUpdated: null,
      refreshing: false,
    },
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useDashboardData>);
  vi.mocked(usePipelineJobs).mockReturnValue({
    jobs: [],
    status: "ready",
    error: null,
    refreshing: false,
    refresh: vi.fn(),
    submitOnce: vi.fn(),
    isDuplicateActive: vi.fn(() => false),
    selectJob: vi.fn(),
  } as unknown as ReturnType<typeof usePipelineJobs>);
}

describe("PerformancePage", () => {
  it("shows durations for diagnosis but suppresses claims when outputs differ", () => {
    configurePage(report);
    render(<PerformancePage />);

    expect(screen.getByText(/Output equivalence was not established/)).toBeInTheDocument();
    expect(screen.getAllByText("10.00 s").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5.00 s").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not assessed").length).toBeGreaterThan(0);
    expect(screen.queryByText("5.00 s saved")).not.toBeInTheDocument();
    expect(screen.queryByText("2.00×")).not.toBeInTheDocument();
  });

  it("does not claim improvement when output equivalence has too few repetitions", () => {
    configurePage({
      ...report,
      equivalent: true,
      repetitions: 1,
      performance_assessment: "insufficient_repetitions",
    });
    render(<PerformancePage />);

    expect(screen.getByText(/fewer than two repetitions/)).toBeInTheDocument();
    expect(screen.getByText("Equivalent")).toBeInTheDocument();
    expect(screen.getAllByText("Not assessed").length).toBeGreaterThan(0);
    expect(screen.queryByText("50.0%")).not.toBeInTheDocument();
    expect(screen.queryByText("2.00×")).not.toBeInTheDocument();
  });
});
