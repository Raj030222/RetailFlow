import type { BenchmarkReport } from "../types/jobs";

export function speedupFactor(report: BenchmarkReport): number | null {
  if (report.equivalent !== true || report.repetitions < 2) return null;
  const baseline = report.baseline.median_seconds;
  const optimized = report.optimized.median_seconds;
  if (!Number.isFinite(baseline) || !Number.isFinite(optimized) || baseline < 0 || optimized <= 0) return null;
  return baseline / optimized;
}

export function reportedImprovement(report: BenchmarkReport): number | null {
  if (report.equivalent !== true || report.repetitions < 2 || report.performance_assessment === "insufficient_repetitions") return null;
  return report.improvement_percent;
}

export function interpretBenchmark(report: BenchmarkReport | null): string {
  if (!report) return "Benchmark results unavailable";
  if (!report.equivalent) return "Output equivalence not established";
  if (report.performance_assessment === "insufficient_repetitions" || report.repetitions < 2) return "Insufficient benchmark repetitions";
  if (report.improvement_percent === null) return "No measurable improvement reported";
  if (report.improvement_percent > 0) return "Optimized pipeline is faster";
  if (report.improvement_percent < 0) return "Optimized pipeline is slower";
  return "No measurable improvement";
}
