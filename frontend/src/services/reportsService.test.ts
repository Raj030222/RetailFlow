import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./apiClient", () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from "./apiClient";
import { getBenchmarkReports, getRunReports } from "./reportsService";

describe("reportsService", () => {
  beforeEach(() => vi.mocked(apiGet).mockReset());

  it("requests only the configured run report route and mode", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      batch_id: "batch-one",
      reports: {
        baseline: { metrics: null, reconciliation: { status: "PASS" } },
      },
    });
    await getRunReports("../batch-one", "baseline");
    expect(apiGet).toHaveBeenCalledWith(
      "/api/v1/reports/runs/..%2Fbatch-one?mode=baseline",
      { signal: undefined },
    );
  });

  it("rejects malformed run and benchmark report responses", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ batch_id: "x", reports: null });
    await expect(getRunReports("x")).rejects.toThrow("unexpected shape");

    vi.mocked(apiGet).mockResolvedValueOnce({
      json: "not-an-object",
      csv: null,
      markdown: null,
    });
    await expect(getBenchmarkReports()).rejects.toThrow("unexpected shape");
  });
});
