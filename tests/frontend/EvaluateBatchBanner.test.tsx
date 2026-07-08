// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "../../src/lib/api/client";

const mockEvaluateBatch = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/api/client")>("../../src/lib/api/client");
  return { ...actual, evaluateBatch: mockEvaluateBatch };
});

const { EvaluateBatchBanner } = await import("../../src/components/dashboard/EvaluateBatchBanner");

describe("EvaluateBatchBanner", () => {
  beforeEach(() => {
    mockEvaluateBatch.mockReset();
  });

  it("shows first-evaluation messaging when the batch has never been evaluated", () => {
    render(<EvaluateBatchBanner displayName="Fall 2026" newCompanyCount={4} isFirstEvaluation onStarted={vi.fn()} />);
    expect(screen.getByText(/Fall 2026 — 4 companies so far/)).toBeInTheDocument();
    expect(screen.getByText("Scout hasn't looked at this batch yet.")).toBeInTheDocument();
  });

  it("shows refresh messaging when the batch has already been evaluated but has grown", () => {
    render(<EvaluateBatchBanner displayName="Summer 2026" newCompanyCount={8} isFirstEvaluation={false} onStarted={vi.fn()} />);
    expect(screen.getByText(/Summer 2026 has 8 new companies/)).toBeInTheDocument();
    expect(screen.getByText("Since Scout last checked this batch.")).toBeInTheDocument();
  });

  it("uses singular 'company' for a count of exactly 1, in both modes", () => {
    const { rerender } = render(<EvaluateBatchBanner displayName="Fall 2026" newCompanyCount={1} isFirstEvaluation onStarted={vi.fn()} />);
    expect(screen.getByText(/1 company so far/)).toBeInTheDocument();

    rerender(<EvaluateBatchBanner displayName="Fall 2026" newCompanyCount={1} isFirstEvaluation={false} onStarted={vi.fn()} />);
    expect(screen.getByText(/1 new company\b/)).toBeInTheDocument();
  });

  it("calls evaluateBatch with the display name and onStarted on success", async () => {
    mockEvaluateBatch.mockResolvedValueOnce({ ok: true, message: "Started." });
    const onStarted = vi.fn();
    const user = userEvent.setup();
    render(<EvaluateBatchBanner displayName="Fall 2026" newCompanyCount={4} isFirstEvaluation onStarted={onStarted} />);

    await user.click(screen.getByRole("button", { name: "Evaluate this batch" }));

    expect(mockEvaluateBatch).toHaveBeenCalledWith("Fall 2026");
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
  });

  it("disables the button and shows a starting state while the request is in flight, staying that way on success (the parent replaces this component once evaluation starts)", async () => {
    let resolvePromise: (v: { ok: boolean; message: string }) => void = () => {};
    mockEvaluateBatch.mockReturnValueOnce(new Promise((resolve) => (resolvePromise = resolve)));
    const onStarted = vi.fn();
    const user = userEvent.setup();
    render(<EvaluateBatchBanner displayName="Fall 2026" newCompanyCount={4} isFirstEvaluation onStarted={onStarted} />);

    await user.click(screen.getByRole("button", { name: "Evaluate this batch" }));

    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
    resolvePromise({ ok: true, message: "Started." });
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
  });

  it("shows the error message and re-enables the button on failure, without calling onStarted", async () => {
    mockEvaluateBatch.mockRejectedValueOnce(new ApiError("just triggered — wait a bit", 409));
    const onStarted = vi.fn();
    const user = userEvent.setup();
    render(<EvaluateBatchBanner displayName="Fall 2026" newCompanyCount={4} isFirstEvaluation onStarted={onStarted} />);

    await user.click(screen.getByRole("button", { name: "Evaluate this batch" }));

    await waitFor(() => expect(screen.getByText("just triggered — wait a bit")).toBeInTheDocument());
    expect(onStarted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Evaluate this batch" })).not.toBeDisabled();
  });
});
