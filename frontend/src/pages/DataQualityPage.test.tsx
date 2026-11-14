import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/jobsService", () => ({
  getJobLogs: vi.fn(),
  listJobs: vi.fn(),
  submitValidation: vi.fn(),
}));

import { BackendHealthContext } from "../hooks/backendHealthContext";
import { getJobLogs, listJobs, submitValidation } from "../services/jobsService";
import type { JobRecord, JobSubmission } from "../types/jobs";
import { DataQualityPage } from "./DataQualityPage";

function validationJob(
  status: JobRecord["status"],
  jobId = "a".repeat(32),
): JobRecord {
  return {
    job_id: jobId,
    job_type: "validate",
    status,
    created_at: "2026-11-14T01:00:00Z",
    started_at: status === "queued" ? null : "2026-11-14T01:00:01Z",
    completed_at:
      status === "succeeded" || status === "failed"
        ? "2026-11-14T01:00:02Z"
        : null,
    exit_code: status === "succeeded" ? 2 : null,
    error_summary: status === "failed" ? "Input validation process failed" : null,
    report_references: {},
  };
}

function renderPage() {
  return render(
    <BackendHealthContext.Provider value="connected">
      <DataQualityPage />
    </BackendHealthContext.Provider>,
  );
}

describe("DataQualityPage", () => {
  beforeEach(() => {
    vi.mocked(listJobs).mockReset();
    vi.mocked(getJobLogs).mockReset();
    vi.mocked(submitValidation).mockReset();
  });

  it("shows actual validation metrics and distinguishes quality FAIL from successful execution", async () => {
    const job = validationJob("succeeded");
    const report = {
      status: "FAIL",
      input_records: 10,
      valid_records: 7,
      rejected_records: 2,
      duplicate_records: 1,
      rejection_reason_counts: {
        invalid_customer_reference: 1,
        missing_customer_id: 1,
      },
      malformed_records: 0,
      malformed_records_by_dataset: {
        customers: 0,
        products: 1,
        transactions: 0,
      },
      duplicate_dimension_keys: { customers: 0, products: 0 },
      missing_dimension_keys: { customers: 0, products: 0 },
      reconciled: true,
    };
    vi.mocked(listJobs).mockResolvedValue([job]);
    vi.mocked(getJobLogs).mockResolvedValue({
      job_id: job.job_id,
      stdout: `Validation summary:\n${JSON.stringify(report)}`,
      stderr: "validation warning",
      truncated: false,
    });
    renderPage();

    expect(await screen.findByText("Job execution succeeded. The validation report independently returned FAIL."))
      .toBeInTheDocument();
    expect(screen.getAllByText("FAIL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("succeeded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Malformed records").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Input records are split into valid, rejected, and duplicate records\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Duplicate records are excluded from rejected records\./))
      .toBeInTheDocument();
    expect(screen.getByText("Products")).toBeInTheDocument();
    expect(screen.getByText("validation warning")).toBeInTheDocument();
    const reasonSection = screen.getByRole("region", { name: "Rejection reason counts" });
    expect(within(reasonSection).getByText("invalid_customer_reference")).toBeInTheDocument();
    expect(within(reasonSection).getByText("missing_customer_id")).toBeInTheDocument();
    expect(within(reasonSection).getAllByText("1")).toHaveLength(2);
    expect(getJobLogs).toHaveBeenCalledWith(job.job_id, expect.any(AbortSignal));
    expect(submitValidation).not.toHaveBeenCalled();
  });

  it("shows Not reported for older validation output without rejection reason counts", async () => {
    const job = validationJob("succeeded");
    vi.mocked(listJobs).mockResolvedValue([job]);
    vi.mocked(getJobLogs).mockResolvedValue({
      job_id: job.job_id,
      stdout: JSON.stringify({ status: "PASS", rejected_records: 0 }),
      stderr: "",
      truncated: false,
    });
    renderPage();

    const reasonSection = await screen.findByRole("region", {
      name: "Rejection reason counts",
    });
    expect(within(reasonSection).getByText("Not reported")).toBeInTheDocument();
  });

  it("shows missing-input output as execution ERROR rather than a quality FAIL", async () => {
    const job = {
      ...validationJob("failed"),
      exit_code: 2,
      error_summary: "Missing required input files",
    };
    vi.mocked(listJobs).mockResolvedValue([job]);
    vi.mocked(getJobLogs).mockResolvedValue({
      job_id: job.job_id,
      stdout: JSON.stringify({
        status: "FAIL",
        error: "Missing required inputs: ['transactions.csv']",
      }),
      stderr: "",
      truncated: false,
    });
    renderPage();

    expect(await screen.findByText("The validation output could not be interpreted."))
      .toBeInTheDocument();
    expect(screen.getAllByText("ERROR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("failed").length).toBeGreaterThan(0);
    expect(screen.queryByText("Job execution is failed. The validation report independently returned FAIL."))
      .not.toBeInTheDocument();
    expect(screen.getAllByText("Missing required input files").length).toBeGreaterThan(0);
  });

  it("submits validation only after confirmation and displays the persisted job id", async () => {
    const user = userEvent.setup();
    const queued: JobSubmission = {
      job_id: "b".repeat(32),
      job_type: "validate",
      status: "queued",
      created_at: "2026-11-14T01:02:00Z",
    };
    vi.mocked(listJobs)
      .mockResolvedValueOnce([])
      .mockResolvedValue([validationJob("queued", queued.job_id)]);
    vi.mocked(submitValidation).mockResolvedValue(queued);
    renderPage();

    await user.click(screen.getByRole("button", { name: "Run Validation" }));
    expect(submitValidation).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Validate and queue",
      }),
    );
    await waitFor(() => expect(submitValidation).toHaveBeenCalledOnce());
    expect(
      await screen.findByText(
        (_, element) =>
          element?.getAttribute("role") === "status" &&
          Boolean(element.textContent?.includes(queued.job_id)),
      ),
    ).toBeInTheDocument();
    expect(await screen.findAllByText("RUNNING")).not.toHaveLength(0);
  });

  it("shows no-data and unavailable states instead of fabricated zeros", async () => {
    vi.mocked(listJobs).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No validation jobs")).toBeInTheDocument();
    expect(screen.getAllByText("NO DATA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  });

  it("surfaces API history failures without crashing the dashboard", async () => {
    vi.mocked(listJobs).mockRejectedValue(new Error("offline"));
    renderPage();
    expect(
      await screen.findByText(
        "Validation history could not be refreshed. Existing results are retained.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data Quality & Validation" }))
      .toBeInTheDocument();
  });
});
