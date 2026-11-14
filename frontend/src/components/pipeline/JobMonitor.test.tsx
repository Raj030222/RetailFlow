import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBenchmarkReports } from "../../services/reportsService";
import type { JobRecord } from "../../types/jobs";
import { JobMonitor } from "./JobMonitor";

vi.mock("../../services/reportsService", () => ({
  getBenchmarkReports: vi.fn(),
}));

function job(
  jobType: JobRecord["job_type"],
  status: JobRecord["status"],
): JobRecord {
  return {
    job_id: "c".repeat(32),
    job_type: jobType,
    status,
    created_at: "2026-11-13T10:00:00Z",
    started_at: "2026-11-13T10:00:01Z",
    completed_at: status === "succeeded" ? "2026-11-13T10:00:02Z" : null,
    exit_code: status === "succeeded" ? 0 : null,
    error_summary: status === "failed" ? "Spark process failed" : null,
    report_references: {},
  };
}

function renderMonitor(selectedJob: JobRecord, stdout: string, stderr = "") {
  return render(
    <JobMonitor
      detailsLoading={false}
      error={null}
      jobs={[selectedJob]}
      lastUpdated={new Date("2026-11-13T10:00:00Z")}
      logsError={null}
      logsTruncated={false}
      refresh={async () => {}}
      hasMore={false}
      loadMore={async () => {}}
      loadingMore={false}
      refreshing={false}
      selectJob={vi.fn()}
      selectedJob={selectedJob}
      selectedJobId={selectedJob.job_id}
      status="ready"
      stderr={stderr}
      stdout={stdout}
    />,
  );
}

describe("JobMonitor", () => {
  beforeEach(() => vi.mocked(getBenchmarkReports).mockReset());

  it("shows persisted job status, validation result, and separate log streams", async () => {
    const report = {
      status: "FAIL",
      input_records: 12,
      valid_records: 9,
      rejected_records: 2,
      duplicate_records: 1,
      malformed_records: 0,
    };
    const selectedJob = job("validate", "failed");
    selectedJob.report_references = {
      baseline: ["batch-123:metrics", "batch-123:reconciliation"],
    };
    renderMonitor(selectedJob, JSON.stringify(report), "validation error");

    expect(screen.getByText("Job failed")).toBeInTheDocument();
    expect(screen.getByText("Spark process failed")).toBeInTheDocument();
    expect(screen.getByText("Validation result:")).toBeInTheDocument();
    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/batch-123:metrics/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "stderr" }));
    expect(screen.getByLabelText("stderr execution log")).toHaveTextContent(
      "validation error",
    );
    expect(screen.getByText(/without per-line timestamps/)).toBeInTheDocument();
  });

  it("does not fetch a benchmark report until the selected benchmark succeeds", async () => {
    const selectedJob = job("benchmark", "failed");
    renderMonitor(selectedJob, "", "benchmark failed");
    expect(getBenchmarkReports).not.toHaveBeenCalled();
  });

  it("handles a missing report after successful benchmark completion", async () => {
    vi.mocked(getBenchmarkReports).mockResolvedValue({
      json: null,
      csv: null,
      markdown: null,
    });
    renderMonitor(job("benchmark", "succeeded"), "");
    await waitFor(() =>
      expect(
        screen.getByText("The benchmark report is not present or has an unsupported structure."),
      ).toBeInTheDocument(),
    );
  });

  it("renders a truthful empty job history", () => {
    render(
      <JobMonitor
        detailsLoading={false}
        error={null}
        jobs={[]}
        lastUpdated={null}
        logsError={null}
        logsTruncated={false}
        refresh={async () => {}}
        hasMore={false}
        loadMore={async () => {}}
        loadingMore={false}
        refreshing={false}
        selectJob={vi.fn()}
        selectedJob={null}
        selectedJobId={null}
        status="empty"
        stderr=""
        stdout=""
      />,
    );
    expect(screen.getByText("No jobs recorded")).toBeInTheDocument();
  });
});
