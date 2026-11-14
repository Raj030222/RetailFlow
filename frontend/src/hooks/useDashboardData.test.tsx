import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/dashboardService", () => ({
  hasActiveJobs: vi.fn(() => false),
  loadBenchmarkWidget: vi.fn(),
  loadJobsWidget: vi.fn(),
  loadQualityWidget: vi.fn(),
}));

import {
  loadBenchmarkWidget,
  loadJobsWidget,
  loadQualityWidget,
} from "../services/dashboardService";
import { useDashboardData } from "./useDashboardData";

const jobsWidget = { status: "empty" as const, jobs: [] };
const benchmarkWidget = { status: "empty" as const, report: null };
const qualityWidget = {
  status: "empty" as const,
  source: null,
  report: null,
};

describe("useDashboardData", () => {
  beforeEach(() => {
    vi.mocked(loadJobsWidget).mockResolvedValue(jobsWidget);
    vi.mocked(loadBenchmarkWidget).mockResolvedValue(benchmarkWidget);
    vi.mocked(loadQualityWidget).mockResolvedValue(qualityWidget);
  });

  it("loads independent dashboard widgets and supports manual refresh", async () => {
    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.data.jobs.status).toBe("empty"));
    expect(loadJobsWidget).toHaveBeenCalledTimes(1);
    expect(loadBenchmarkWidget).toHaveBeenCalledTimes(1);
    expect(loadQualityWidget).toHaveBeenCalledWith([], expect.any(AbortSignal));

    await act(async () => {
      await result.current.refresh();
    });
    expect(loadJobsWidget).toHaveBeenCalledTimes(2);
    expect(result.current.data.lastUpdated).toBeInstanceOf(Date);
    expect(result.current.data.refreshing).toBe(false);
  });

  it("does not present a stale quality report when the latest refresh fails", async () => {
    const previousQuality = {
      status: "ready" as const,
      source: "reconciliation" as const,
      report: { status: "PASS" as const },
    };
    vi.mocked(loadQualityWidget)
      .mockResolvedValueOnce(previousQuality)
      .mockResolvedValueOnce({
        status: "error",
        source: null,
        report: null,
        message: "The latest validation output is malformed or unavailable.",
      });

    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.data.quality).toEqual(previousQuality));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data.quality).toMatchObject({
      status: "error",
      report: null,
      message: "The latest validation output is malformed or unavailable.",
    });
  });

  it("does not leave a refresh timer active when the document is hidden", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const { unmount } = renderHook(() => useDashboardData());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(loadJobsWidget).toHaveBeenCalledTimes(1);
  });

  it("refreshes periodically while visible and clears the timer on unmount", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    const { unmount } = renderHook(() => useDashboardData());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadJobsWidget).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadJobsWidget).toHaveBeenCalledTimes(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });
});
