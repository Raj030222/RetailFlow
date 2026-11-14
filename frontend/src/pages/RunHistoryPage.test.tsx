import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/jobsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/jobsService")>();
  return {
    ...actual,
    getJob: vi.fn(),
    getJobLogs: vi.fn(),
    listJobs: vi.fn(),
  };
});

vi.mock("../services/reportsService", () => ({
  getRunReports: vi.fn(),
}));

import { ThemeProvider } from "../components/theme/ThemeProvider";
import { BackendHealthContext } from "../hooks/backendHealthContext";
import { getJob, getJobLogs, listJobs } from "../services/jobsService";
import { getRunReports } from "../services/reportsService";
import type { JobRecord } from "../types/jobs";
import { RunHistoryPage } from "./RunHistoryPage";
import { MemoryRouter } from "react-router-dom";

function job(
  jobType: JobRecord["job_type"] = "baseline",
  jobId = "a".repeat(32),
  status: JobRecord["status"] = "succeeded",
): JobRecord {
  return {
    job_id: jobId,
    job_type: jobType,
    status,
    created_at: "2026-11-13T10:00:00Z",
    started_at: "2026-11-13T10:00:01Z",
    completed_at: "2026-11-13T10:00:03Z",
    exit_code: status === "succeeded" ? 0 : null,
    error_summary: status === "failed" ? "Pipeline command failed" : null,
    report_references:
      jobType === "baseline"
        ? { baseline: ["batch-42:metrics", "batch-42:reconciliation"] }
        : {},
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BackendHealthContext.Provider value="connected">
        <RunHistoryPage />
      </BackendHealthContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(listJobs).mockReset();
  vi.mocked(getJob).mockReset();
  vi.mocked(getJobLogs).mockReset();
  vi.mocked(getRunReports).mockReset();
  vi.mocked(listJobs).mockResolvedValue([]);
  vi.mocked(getJob).mockImplementation(async (jobId) => job("baseline", jobId));
  vi.mocked(getJobLogs).mockImplementation(async (jobId) => ({
    job_id: jobId,
    stdout: "pipeline started\npipeline complete",
    stderr: "warning: sample warning",
    truncated: false,
  }));
  vi.mocked(getRunReports).mockResolvedValue({
    batch_id: "batch-42",
    reports: {
      baseline: {
        metrics: {
          batch_id: "batch-42",
          mode: "baseline",
          run_id: "run-42",
          pipeline_status: "SUCCESS",
          start_time: "2026-11-13T10:00:01Z",
          end_time: "2026-11-13T10:00:02Z",
          output_records: 17,
        },
        reconciliation: { output_records: 17 },
      },
    },
  });
});

describe("RunHistoryPage", () => {
  it("shows loading, empty, and API error states", async () => {
    let resolveJobs!: (jobs: JobRecord[]) => void;
    vi.mocked(listJobs).mockReturnValue(
      new Promise<JobRecord[]>((resolve) => {
        resolveJobs = resolve;
      }),
    );
    renderPage();
    expect(await screen.findByRole("status", { name: "Loading run history" }))
      .toBeInTheDocument();

    await act(async () => resolveJobs([]));
    expect(await screen.findByText("No run history")).toBeInTheDocument();

    vi.mocked(listJobs).mockRejectedValue(new Error("offline"));
    renderPage();
    expect(
      await screen.findByText("Job history could not be refreshed. Existing results are retained."),
    ).toBeInTheDocument();
  });

  it("filters loaded runs by operation, status, job ID, and referenced batch ID", async () => {
    const baseline = job("baseline", "a".repeat(32));
    const failed = {
      ...job("validate", "b".repeat(32), "failed"),
      report_references: {},
    };
    vi.mocked(listJobs).mockResolvedValue([baseline, failed]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2 loaded executions/)).toBeInTheDocument();
    expect(screen.getAllByText(/batch-42/).length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by operation" }), "validate");
    expect(screen.getByRole("button", { name: /Inspect validate job/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inspect baseline job/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by status" }), "succeeded");
    expect(screen.getByText("No matching executions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.type(screen.getByRole("searchbox", { name: "Search job or batch ID" }), "batch-42");
    expect(screen.getByRole("button", { name: /Inspect baseline job/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inspect validate job/ })).not.toBeInTheDocument();
  });

  it("loads selected-run details, separate log streams, and an associated lineage link", async () => {
    const selected = job("baseline");
    vi.mocked(listJobs).mockResolvedValue([selected]);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Inspect baseline job/ }),
    );
    expect(await screen.findByText("Execution details")).toBeInTheDocument();
    expect(screen.getAllByText("Pipeline run · baseline").length).toBeGreaterThan(0);
    expect(await screen.findByText(/Pipeline run ID: run-42/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /View verified lineage/ }))
      .toHaveAttribute("href", `/lineage?jobId=${selected.job_id}`);

    await user.click(screen.getByRole("button", { name: "stderr" }));
    expect(screen.getByLabelText("stderr execution log")).toHaveTextContent(
      "warning: sample warning",
    );
    await user.type(screen.getByRole("searchbox", { name: "Search loaded stderr logs" }), "missing");
    expect(screen.getByLabelText("stderr execution log")).toHaveTextContent(
      "No loaded log lines match the search.",
    );
  });

  it("selects a report-linked job from the jobId query parameter", async () => {
    const linkedJob = job("baseline", "linked-job");
    vi.mocked(listJobs).mockResolvedValue([linkedJob]);
    vi.mocked(getJob).mockResolvedValue(linkedJob);
    render(
      <MemoryRouter initialEntries={[`/history?jobId=${linkedJob.job_id}`]}>
        <BackendHealthContext.Provider value="connected">
          <RunHistoryPage />
        </BackendHealthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Execution details")).toBeInTheDocument();
    await waitFor(() =>
      expect(getJob).toHaveBeenCalledWith(
        linkedJob.job_id,
        expect.any(AbortSignal),
      ),
    );
    expect(
      within(
        screen.getByRole("table", {
          name: "Persisted RetailFlow executions in the currently loaded history",
        }),
      )
        .getAllByRole("row")[1],
    ).toHaveAttribute("aria-selected", "true");
  });

  it("displays parsed validation findings separately from job execution status", async () => {
    const validationJob = job("validate", "c".repeat(32), "succeeded");
    vi.mocked(listJobs).mockResolvedValue([validationJob]);
    vi.mocked(getJob).mockResolvedValue(validationJob);
    vi.mocked(getJobLogs).mockResolvedValue({
      job_id: validationJob.job_id,
      stdout: JSON.stringify({
        status: "PASS",
        input_records: 12,
        valid_records: 10,
        rejected_records: 2,
        duplicate_records: 0,
        malformed_records: 1,
      }),
      stderr: "",
      truncated: false,
    });
    renderPage();

    expect(await screen.findByText(/Data-quality result:/)).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
    expect(screen.getByText(/independent of the job execution status/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("keeps unavailable fields explicit and uses theme tokens in a responsive table", async () => {
    document.documentElement.classList.add("dark");
    const sparseJob = {
      ...job("generate", "d".repeat(32)),
      started_at: null,
      completed_at: null,
      exit_code: null,
      report_references: {},
    };
    vi.mocked(listJobs).mockResolvedValue([sparseJob]);
    vi.mocked(getJob).mockResolvedValue(sparseJob);
    vi.mocked(getJobLogs).mockResolvedValue({
      job_id: sparseJob.job_id,
      stdout: "",
      stderr: "",
      truncated: false,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <BackendHealthContext.Provider value="connected">
            <RunHistoryPage />
          </BackendHealthContext.Provider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const table = await screen.findByRole("table", {
      name: "Persisted RetailFlow executions in the currently loaded history",
    });
    expect(table.parentElement).toHaveClass("overflow-x-auto");
    expect(document.documentElement).toHaveClass("dark");
    await user.click(screen.getByRole("button", { name: /Inspect generate job/ }));
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
    expect(
      await screen.findByText(/does not include generation request parameters/),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  });
});
