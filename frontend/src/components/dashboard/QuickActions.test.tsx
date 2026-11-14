import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QuickActions } from "./QuickActions";
import { submitRun } from "../../services/jobsService";

vi.mock("../../services/jobsService", () => ({
  submitBenchmark: vi.fn(),
  submitGenerate: vi.fn(),
  submitRun: vi.fn(),
  submitValidation: vi.fn(),
}));

describe("QuickActions", () => {
  beforeEach(() => {
    vi.mocked(submitRun).mockReset();
  });

  it("requires explicit confirmation before publishing a pipeline run", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    vi.mocked(submitRun).mockResolvedValue({
      job_id: "a".repeat(32),
      job_type: "both",
      status: "queued",
      created_at: "2026-11-13T10:00:00Z",
    });
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <QuickActions jobs={[]} onSubmitted={onSubmitted} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /Run both modes/ }));
    expect(
      screen.getByText(/can publish output batches for both modes/),
    ).toBeInTheDocument();
    expect(submitRun).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm and submit" }));
    await waitFor(() => expect(submitRun).toHaveBeenCalledWith({ mode: "both" }));
    expect(onSubmitted).toHaveBeenCalledOnce();
    expect(await screen.findByText("Job queued")).toBeInTheDocument();
    expect(screen.getByText("a".repeat(32))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View run history" })).toHaveAttribute(
      "href",
      "/history",
    );
  });

  it("does not submit when the confirmation dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <QuickActions jobs={[]} onSubmitted={vi.fn()} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /Generate sample data/ }));
    expect(screen.getByText(/can replace the existing generated dataset/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(submitRun).not.toHaveBeenCalled();
  });
});
