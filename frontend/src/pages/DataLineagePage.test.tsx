import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/jobsService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/jobsService")>();
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

import { BackendHealthContext } from "../hooks/backendHealthContext";
import { ThemeProvider } from "../components/theme/ThemeProvider";
import { getJob, getJobLogs, listJobs } from "../services/jobsService";
import { getRunReports } from "../services/reportsService";
import type { JobRecord } from "../types/jobs";
import { DataLineagePage } from "./DataLineagePage";

function pipelineJob(
  mode: "baseline" | "optimized" = "baseline",
  jobId = "a".repeat(32),
  batchId = "batch-42",
): JobRecord {
  return {
    job_id: jobId,
    job_type: mode,
    status: "succeeded",
    created_at: "2026-11-14T01:00:00Z",
    started_at: "2026-11-14T01:00:01Z",
    completed_at: "2026-11-14T01:04:00Z",
    exit_code: 0,
    error_summary: null,
    report_references: {
      [mode]: [`${batchId}:metrics`, `${batchId}:reconciliation`],
    },
  };
}

function reportResponse(batchId = "batch-42", mode = "baseline") {
  return {
    batch_id: batchId,
    reports: {
      [mode]: {
        metrics: {
          batch_id: batchId,
          mode,
          run_id: "run-42",
          pipeline_status: "SUCCESS",
          start_time: "2026-11-14T01:00:02Z",
          end_time: "2026-11-14T01:03:00Z",
          output_records: 17,
          publication_state: "PUBLISHED",
          publication_target: "runs/batch-42",
        },
        reconciliation: { output_records: 17 },
      },
    },
  };
}

function renderPage(withTheme = false, initialEntries = ["/lineage"]) {
  const page = withTheme ? (
    <ThemeProvider>
      <DataLineagePage />
    </ThemeProvider>
  ) : (
    <DataLineagePage />
  );
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <BackendHealthContext.Provider value="connected">
        {page}
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
  vi.mocked(getJob).mockImplementation(async (jobId) =>
    pipelineJob("baseline", jobId),
  );
  vi.mocked(getJobLogs).mockImplementation(async (jobId) => ({
    job_id: jobId,
    stdout: "pipeline finished",
    stderr: "",
    truncated: false,
  }));
  vi.mocked(getRunReports).mockResolvedValue(reportResponse());
});

describe("DataLineagePage", () => {
  it("renders a loading state while the persisted job list is pending", async () => {
    let resolveJobs!: (jobs: JobRecord[]) => void;
    vi.mocked(listJobs).mockReturnValue(
      new Promise<JobRecord[]>((resolve) => {
        resolveJobs = resolve;
      }),
    );
    renderPage();

    expect(await screen.findByText("Loading pipeline history…")).toBeInTheDocument();
    await act(async () => resolveJobs([]));
    expect(await screen.findByText("No pipeline runs")).toBeInTheDocument();
  });

  it("shows API errors while retaining the static pipeline graph", async () => {
    vi.mocked(listJobs).mockRejectedValue(new Error("offline"));
    renderPage();

    expect(
      await screen.findByText(
        "Pipeline run history could not be loaded. Try refreshing.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Static RetailFlow data lineage from CSV sources to Parquet outputs",
      }),
    ).toBeInTheDocument();
  });

  it("keeps unavailable metadata empty when there is no run history", async () => {
    renderPage();

    expect(await screen.findByText("No pipeline runs")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Select output dataset processed_transactions",
      }),
    );
    expect(screen.getByText("Not reported per dataset")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("17")).not.toBeInTheDocument();
  });

  it("shows source, transformation, and output details when their graph nodes are selected", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Select source dataset customers.csv" }),
    );
    expect(screen.getByRole("heading", { name: "customers.csv" })).toBeInTheDocument();
    expect(screen.getAllByText("data/generated/customers.csv").length).toBeGreaterThan(0);
    expect(screen.getByText(/customer_id, customer_name, email/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Select transformation Baseline processing",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Baseline processing" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/broadcast hints/).length).toBeGreaterThan(0);
    expect(
      screen.getByText("src/retailflow/transformations/baseline.py — transform"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Select output dataset processed_transactions",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "processed_transactions" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Parquet").length).toBeGreaterThan(0);
    expect(screen.getByText(/outputs\/runs\/{batch_id}\/processed_transactions/))
      .toBeInTheDocument();
  });

  it("loads the selected run details, logs, and only matching run report metadata", async () => {
    const first = pipelineJob("baseline", "a".repeat(32), "batch-42");
    const second = pipelineJob("optimized", "b".repeat(32), "batch-43");
    const nonPipeline = {
      ...pipelineJob("baseline", "c".repeat(32)),
      job_type: "validate" as const,
    };
    vi.mocked(listJobs).mockResolvedValue([first, second, nonPipeline]);
    vi.mocked(getJob).mockImplementation(async (jobId) =>
      jobId === second.job_id ? second : first,
    );
    vi.mocked(getRunReports).mockImplementation(async (batchId, mode) =>
      reportResponse(batchId, mode ?? "baseline"),
    );
    const user = userEvent.setup();
    renderPage();

    const select = await screen.findByRole("combobox", {
      name: "Select a pipeline run",
    });

    expect(within(select).getAllByRole("option")).toHaveLength(2);
    await user.selectOptions(select, second.job_id);

    await waitFor(() => {
      expect(getJob).toHaveBeenCalledWith(
        second.job_id,
        expect.any(AbortSignal),
      );
      expect(getJobLogs).toHaveBeenCalledWith(
        second.job_id,
        expect.any(AbortSignal),
      );
      expect(getRunReports).toHaveBeenCalledWith(
        "batch-43",
        "optimized",
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText(/optimized · batch batch-43 · run ID run-42/))
      .toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Select output dataset processed_transactions",
      }),
    );
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getAllByText("run-42").length).toBeGreaterThan(0);
    expect(screen.getByText("PUBLISHED")).toBeInTheDocument();
  });

  it("selects a pipeline run requested by a jobId query parameter", async () => {
    const requested = pipelineJob("optimized", "d".repeat(32), "batch-44");
    vi.mocked(getJob).mockResolvedValue(requested);
    vi.mocked(listJobs).mockResolvedValue([
      pipelineJob("baseline", "e".repeat(32), "batch-45"),
    ]);

    renderPage(false, [`/lineage?jobId=${requested.job_id}`]);

    expect((await screen.findAllByText(requested.job_id)).length).toBeGreaterThan(0);
    expect(getJob).toHaveBeenCalledWith(
      requested.job_id,
      expect.any(AbortSignal),
    );
    expect(await screen.findByText(/Selected from Run History/)).toBeInTheDocument();
  });

  it("uses theme tokens and a horizontally scrollable graph at narrow widths", async () => {
    document.documentElement.classList.add("dark");
    renderPage(true);

    const region = screen.getByRole("region", {
      name: /Data flow graph/,
    });
    const svg = screen.getByRole("img", {
      name: "Static RetailFlow data lineage from CSV sources to Parquet outputs",
    });
    expect(region).toHaveClass("overflow-auto");
    expect(svg).toHaveClass("min-w-[1050px]");
    expect(document.documentElement).toHaveClass("dark");
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("transparent");
  });
});
