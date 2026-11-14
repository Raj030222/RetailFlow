import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadReportContent } from "./reportDownloads";

describe("downloadReportContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a sanitized snapshot download with a fixed MIME type", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:report-snapshot"),
      revokeObjectURL: vi.fn(),
    });
    const clicked = vi.fn<(anchor: HTMLAnchorElement) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked(this);
    });

    downloadReportContent("../../batch report.csv", "CSV", "a,b\n1,2");

    const anchor = clicked.mock.calls[0]?.[0];
    expect(anchor).toBeDefined();
    expect(anchor?.download).toBe("batch_report.csv");
    expect(anchor?.href).toBe("blob:report-snapshot");
    expect(URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: "text/csv;charset=utf-8" }),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:report-snapshot");
  });

  it("rejects formats without supported download serialization", () => {
    expect(() =>
      downloadReportContent("validation.log", "Job logs", "raw log"),
    ).toThrow("This report format cannot be downloaded.");
  });
});
