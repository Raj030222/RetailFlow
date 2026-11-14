import { describe, expect, it } from "vitest";
import type { BenchmarkReport } from "../types/jobs";
import { interpretBenchmark, reportedImprovement, speedupFactor } from "./performanceMetrics";

const report: BenchmarkReport = {
  baseline: { median_seconds: 10, output_records: 100, output_counts: {}, plan: "baseline" },
  optimized: { median_seconds: 5, output_records: 100, output_counts: {}, plan: "optimized" },
  equivalent: true, records: 100, repetitions: 3, improvement_percent: 50,
  performance_assessment: "measured", performance_note: "Measured locally",
};

describe("performance metrics", () => {
  it("derives speedup from actual positive medians", () => expect(speedupFactor(report)).toBe(2));
  it("does not derive speedup when optimized time is zero", () => expect(speedupFactor({ ...report, optimized: { ...report.optimized, median_seconds: 0 } })).toBeNull());
  it("withholds speedup for non-equivalent, unavailable, or insufficient results", () => {
    expect(speedupFactor({ ...report, equivalent: false })).toBeNull();
    expect(speedupFactor({ ...report, equivalent: undefined as unknown as boolean })).toBeNull();
    expect(speedupFactor({ ...report, repetitions: 1 })).toBeNull();
    expect(reportedImprovement({ ...report, equivalent: undefined as unknown as boolean })).toBeNull();
  });
  it("withholds improvement when repetitions are insufficient or outputs differ", () => {
    expect(reportedImprovement({ ...report, repetitions: 1 })).toBeNull();
    expect(reportedImprovement({ ...report, equivalent: false })).toBeNull();
  });
  it("interprets slower results honestly", () => expect(interpretBenchmark({ ...report, improvement_percent: -10 })).toBe("Optimized pipeline is slower"));
  it("requires equivalence before claiming a performance result", () => expect(interpretBenchmark({ ...report, equivalent: false })).toBe("Output equivalence not established"));
});
