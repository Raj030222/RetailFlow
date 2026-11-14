import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackendHealthContext } from "../hooks/backendHealthContext";
import { usePipelineJobs } from "../hooks/usePipelineJobs";
import {
  submitBenchmark,
  submitGenerate,
  submitRun,
  submitValidation,
} from "../services/jobsService";
import type { SubmitOnce } from "../services/jobsService";
import type { JobType } from "../types/jobs";
import { parseIntegerInput } from "../lib/operationInput";
import { PipelineExecutionPage } from "./PipelineExecutionPage";

vi.mock("../hooks/usePipelineJobs", () => ({
  usePipelineJobs: vi.fn(),
}));

vi.mock("../services/jobsService", () => ({
  submitBenchmark: vi.fn(),
  submitGenerate: vi.fn(),
  submitRun: vi.fn(),
  submitValidation: vi.fn(),
}));

const submitOnce = vi.fn<SubmitOnce>(
  async (_fingerprint, operation) => operation(),
);
const isDuplicateActive = vi.fn(() => false);
const refresh = vi.fn(async () => {});

function queued(jobType: JobType, id: string) {
  return {
    job_id: id.repeat(32).slice(0, 32),
    job_type: jobType,
    status: "queued" as const,
    created_at: "2026-11-13T10:00:00Z",
  };
}

function renderPage() {
  return render(
    <BackendHealthContext.Provider value="connected">
      <PipelineExecutionPage />
    </BackendHealthContext.Provider>,
  );
}

describe("PipelineExecutionPage", () => {
  beforeEach(() => {
    vi.mocked(submitGenerate).mockReset();
    vi.mocked(submitValidation).mockReset();
    vi.mocked(submitRun).mockReset();
    vi.mocked(submitBenchmark).mockReset();
    submitOnce.mockClear();
    isDuplicateActive.mockReset().mockReturnValue(false);
    refresh.mockClear();
    vi.mocked(usePipelineJobs).mockReturnValue({
      jobs: [],
      status: "empty",
      error: null,
      refreshing: false,
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(async () => {}),
      lastUpdated: null,
      refresh,
      selectedJobId: null,
      selectJob: vi.fn(),
      selectedJob: null,
      stdout: "",
      stderr: "",
      logsTruncated: false,
      detailsLoading: false,
      detailsError: null,
      logsError: null,
      isDuplicateActive,
      submitOnce,
    });
  });

  it("submits generation, validation, all run modes, and benchmark only after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(submitGenerate).mockResolvedValue(queued("generate", "a"));
    vi.mocked(submitValidation).mockResolvedValue(queued("validate", "b"));
    vi.mocked(submitRun)
      .mockResolvedValueOnce(queued("baseline", "c"))
      .mockResolvedValueOnce(queued("optimized", "d"))
      .mockResolvedValueOnce(queued("both", "e"));
    vi.mocked(submitBenchmark).mockResolvedValue(queued("benchmark", "f"));
    renderPage();

    await user.click(screen.getByRole("button", { name: "Generate data" }));
    expect(submitGenerate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Generate and queue" }));
    await waitFor(() =>
      expect(submitGenerate).toHaveBeenCalledWith({
        records: 10_000,
        invalid_percent: 0.03,
        duplicate_events: true,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Run validation" }));
    await user.click(screen.getByRole("button", { name: "Validate and queue" }));
    await waitFor(() => expect(submitValidation).toHaveBeenCalledOnce());

    for (const [mode, label] of [
      ["baseline", "Execute and queue"],
      ["optimized", "Execute and queue"],
      ["both", "Execute and queue"],
    ] as const) {
      await user.click(screen.getByRole("button", { name: `Run ${mode}` }));
      await user.click(screen.getByRole("button", { name: label }));
    }
    await waitFor(() => {
      expect(submitRun).toHaveBeenNthCalledWith(1, { mode: "baseline" });
      expect(submitRun).toHaveBeenNthCalledWith(2, { mode: "optimized" });
      expect(submitRun).toHaveBeenNthCalledWith(3, { mode: "both" });
    });

    await user.click(screen.getByRole("button", { name: "Run benchmark" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Run benchmark",
      }),
    );
    await waitFor(() =>
      expect(submitBenchmark).toHaveBeenCalledWith({
        records: 10_000,
        repetitions: 3,
      }),
    );
  });


  it("shows API submission failures without indicating success", async () => {
    const user = userEvent.setup();
    vi.mocked(submitValidation).mockRejectedValue(new Error("API unavailable"));
    renderPage();

    await user.click(screen.getByRole("button", { name: "Run validation" }));
    await user.click(screen.getByRole("button", { name: "Validate and queue" }));

    expect(await screen.findByText("API unavailable")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/Job queued/)).not.toBeInTheDocument();
  });

  it("validates numeric fields and displays duplicate prevention", async () => {
    expect(() => parseIntegerInput("1000001", "Record count", 0, 1_000_000)).toThrow(
      /Record count must be a whole number between 0 and/,
    );
    const firstRender = renderPage();
    expect(screen.getByLabelText("Number of records")).toHaveValue(10_000);
    firstRender.unmount();
    isDuplicateActive.mockReturnValue(true);
    const { unmount } = renderPage();
    expect(screen.getByRole("button", { name: "Generate data" })).toBeDisabled();
    expect(screen.getByText(/exact generation request is already queued or running/)).toBeInTheDocument();
    unmount();
  });
});
