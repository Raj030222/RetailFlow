import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/jobsService", () => ({
  getJob: vi.fn(),
  listJobs: vi.fn(),
}));

vi.mock("../services/reportsService", () => ({
  getBenchmarkReports: vi.fn(),
  getRunReports: vi.fn(),
}));

vi.mock("../services/dataQualityService", () => ({
  fetchValidationOutput: vi.fn(),
}));

import { BackendHealthContext } from "../hooks/backendHealthContext";
import { ApiRequestError } from "../services/apiClient";
import { fetchValidationOutput } from "../services/dataQualityService";
import { getJob, listJobs } from "../services/jobsService";
import {
  getBenchmarkReports,
  getRunReports,
} from "../services/reportsService";
import type { ValidationOutput } from "../types/dataQuality";
import type { JobRecord } from "../types/jobs";
import { MemoryRouter } from "react-router-dom";
import { ReportsPage } from "./ReportsPage";

function job(
  jobType: JobRecord["job_type"] = "baseline",
  jobId = "job-42",
  status: JobRecord["status"] = "succeeded",
): JobRecord {
  return {
    job_id: jobId,
    job_type: jobType,
    status,
    created_at: "2026-11-13T10:00:00Z",
    started_at: "2026-11-13T10:00:01Z",
    completed_at: "2026-11-13T10:00:05Z",
    exit_code: status === "succeeded" ? 0 : null,
    error_summary: null,
    report_references:
      jobType === "baseline"
        ? { baseline: ["batch-42:metrics", "batch-42:reconciliation"] }
        : {},
  };
}

function renderPage(path = "/reports") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BackendHealthContext.Provider value="connected">
        <ReportsPage />
      </BackendHealthContext.Provider>
    </MemoryRouter>,
  );
}

const runReport = {
  batch_id: "batch-42",
  reports: {
    baseline: {
      metrics: {
        batch_id: "batch-42",
        mode: "baseline",
        run_id: "run-42",
        pipeline_status: "SUCCESS",
        start_time: "2026-11-13T10:00:02Z",
        end_time: "2026-11-13T10:00:04Z",
      },
      reconciliation: {
        mode: "baseline",
        status: "PASS",
      },
    },
  },
};

const benchmarkReports = {
  json: {
    baseline: {
      median_seconds: 4,
      output_records: 10,
      output_counts: {},
      plan: "baseline plan",
    },
    optimized: {
      median_seconds: 2,
      output_records: 10,
      output_counts: {},
      plan: "optimized plan",
    },
    equivalent: true,
    records: 10,
    repetitions: 3,
    improvement_percent: 50,
    performance_assessment: "optimized_faster",
    performance_note: "Optimized median was lower.",
  },
  csv: "implementation,seconds\nbaseline,4\noptimized,2",
  markdown: "# Benchmark\n\nResults are equivalent.",
};

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  vi.clearAllMocks();
  vi.mocked(listJobs).mockResolvedValue([job()]);
  vi.mocked(getJob).mockImplementation(async (jobId) => ({
    ...job(),
    job_id: jobId,
  }));
  vi.mocked(getRunReports).mockResolvedValue(runReport);
  vi.mocked(getBenchmarkReports).mockResolvedValue(benchmarkReports);
  vi.mocked(fetchValidationOutput).mockImplementation(async (validationJob) => ({
    job_id: validationJob.job_id,
    stdout: JSON.stringify({
      status: "PASS",
      input_records: 12,
      valid_records: 12,
      rejected_records: 0,
      duplicate_records: 0,
      malformed_records: 0,
    }),
    stderr: "",
    truncated: false,
    state: "ready",
    report: {
      status: "PASS",
      input_records: 12,
      valid_records: 12,
      rejected_records: 0,
      duplicate_records: 0,
      malformed_records: 0,
    },
  }));
});

describe("ReportsPage", () => {
  it("renders a loading skeleton while persisted history is loading", async () => {
    vi.mocked(getBenchmarkReports).mockResolvedValue({
      json: null,
      csv: null,
      markdown: null,
    });
    let resolveJobs!: (jobs: JobRecord[]) => void;
    vi.mocked(listJobs).mockReturnValue(
      new Promise<JobRecord[]>((resolve) => {
        resolveJobs = resolve;
      }),
    );
    renderPage();
    expect(await screen.findByRole("status", { name: "Loading report catalog" }))
      .toBeInTheDocument();

    await act(async () => resolveJobs([]));
    expect(await screen.findByRole("heading", { name: "No reports available" }))
      .toBeInTheDocument();
  });

  it("shows API failures and an empty catalog without fabricating reports", async () => {
    vi.mocked(listJobs).mockRejectedValue(new Error("offline"));
    vi.mocked(getBenchmarkReports).mockRejectedValue(new Error("offline"));
    renderPage();

    expect(await screen.findByText("Job history could not be loaded")).toBeInTheDocument();
    expect(await screen.findByText("Benchmark reports could not be loaded")).toBeInTheDocument();
    expect(await screen.findByText("Report catalog unavailable")).toBeInTheDocument();

    vi.mocked(listJobs).mockResolvedValue([]);
    vi.mocked(getBenchmarkReports).mockResolvedValue({
      json: null,
      csv: null,
      markdown: null,
    });
    renderPage();
    expect(await screen.findByText("No reports available")).toBeInTheDocument();
    expect(screen.queryByText("benchmark_results.json")).not.toBeInTheDocument();
  });

  it("filters report types and links a selected report only to a verified job", async () => {
    const user = userEvent.setup();
    renderPage();

    const reportButton = await screen.findByRole("button", {
      name: /Baseline pipeline metrics · batch-42/,
    });
    await user.click(reportButton);
    expect(await screen.findByText("run-42")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /View verified job/ }))
      .toHaveAttribute("href", "/history?jobId=job-42");
    expect(getJob).toHaveBeenCalledWith("job-42", expect.any(AbortSignal));

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter reports by category" }),
      "Data Quality",
    );
    expect(
      within(screen.getByRole("region", { name: "Report catalog" })).queryByText(
        "Baseline pipeline metrics · batch-42",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Baseline reconciliation · batch-42")).toBeInTheDocument();
  });

  it("searches report names and keeps the search control full width", async () => {
    const user = userEvent.setup();
    renderPage();

    const catalog = await screen.findByRole("region", { name: "Report catalog" });
    const search = within(catalog).getByRole("searchbox", {
      name: "Search report catalog",
    });

    expect(search).toHaveClass("min-w-0", "w-full");
    await user.type(search, "Baseline pipeline metrics");

    expect(
      within(catalog).getByText("Baseline pipeline metrics · batch-42"),
    ).toBeInTheDocument();
    expect(
      within(catalog).queryByText("Baseline reconciliation · batch-42"),
    ).not.toBeInTheDocument();
  });

  it("shows a missing batch report as unavailable without a job link", async () => {
    vi.mocked(getRunReports).mockRejectedValue(
      new ApiRequestError("Not found", 404),
    );
    renderPage();

    expect(
      await screen.findByRole("button", {
        name: /Baseline pipeline metrics · batch-42/,
      }),
    ).toHaveTextContent("Unavailable");
    await userEvent.click(
      screen.getByRole("button", {
        name: /Baseline pipeline metrics · batch-42/,
      }),
    );
    expect(
      await screen.findByText(
        "The referenced report file is not present. Batch reports may be overwritten or removed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /View verified job/ }),
    ).not.toBeInTheDocument();
  });

  it("loads validation results on selection and keeps quality status separate from execution status", async () => {
    const failedValidation = job("validate", "validation-job", "failed");
    vi.mocked(listJobs).mockResolvedValue([failedValidation]);
    vi.mocked(getJob).mockResolvedValue(failedValidation);
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: /Validation job output · validation-job/,
      }),
    );
    expect(await screen.findByText("PASS")).toBeInTheDocument();
    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(fetchValidationOutput).toHaveBeenCalledWith(
      failedValidation,
      expect.any(AbortSignal),
    );
    expect(screen.getAllByText(/not a separate report file/).length).toBeGreaterThan(0);
  });

  it("ignores validation output that resolves after a newer report selection", async () => {
    const firstJob = job("validate", "validation-first");
    const secondJob = job("validate", "validation-second");
    vi.mocked(listJobs).mockResolvedValue([firstJob, secondJob]);
    vi.mocked(getJob).mockImplementation(async (jobId) =>
      jobId === firstJob.job_id ? firstJob : secondJob,
    );
    let resolveFirst!: (output: ValidationOutput) => void;
    vi.mocked(fetchValidationOutput).mockImplementation(async (validationJob) => {
      if (validationJob.job_id === firstJob.job_id) {
        return new Promise<ValidationOutput>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return {
        job_id: secondJob.job_id,
        stdout: '{"status":"FAIL"}',
        stderr: "",
        truncated: false,
        state: "ready",
        report: { status: "FAIL" },
      };
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: /Validation job output · validation-first/,
      }),
    );
    await waitFor(() =>
      expect(fetchValidationOutput).toHaveBeenCalledWith(
        firstJob,
        expect.any(AbortSignal),
      ),
    );
    await user.click(
      screen.getByRole("button", {
        name: /Validation job output · validation-second/,
      }),
    );
    expect(await screen.findAllByText("FAIL")).not.toHaveLength(0);

    await act(async () =>
      resolveFirst({
        job_id: firstJob.job_id,
        stdout: '{"status":"PASS"}',
        stderr: "",
        truncated: false,
        state: "ready",
        report: { status: "PASS" },
      }),
    );
    expect(screen.queryByText("PASS")).not.toBeInTheDocument();
    expect(screen.getAllByText("FAIL").length).toBeGreaterThan(0);
  });

  it("renders using theme tokens and responsive layouts", async () => {
    document.documentElement.classList.add("dark");
    renderPage();
    const catalog = await screen.findByRole("region", { name: "Report catalog" });
    expect(document.documentElement).toHaveClass("dark");
    expect(catalog).toHaveClass("bg-card");
    expect(catalog).toHaveClass("rounded-lg");
    expect(screen.getByRole("group", { name: "Report filters" }))
      .toHaveClass("sm:grid-cols-2");
    expect(screen.getByRole("combobox", { name: "Filter reports by category" }))
      .toHaveClass("min-w-0", "w-full");
    expect(screen.getByRole("region", { name: "Report catalog" }).parentElement)
      .toHaveClass("xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]");
  });
});
