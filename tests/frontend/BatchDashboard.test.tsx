// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleBatchDetail, sampleCompactCompany } from "./fixtures";
import { ApiError } from "../../src/lib/api/client";

const { mockFetchYcBatches, mockFetchBatchDetail, mockEvaluateBatch } = vi.hoisted(() => ({
  mockFetchYcBatches: vi.fn(),
  mockFetchBatchDetail: vi.fn(),
  mockEvaluateBatch: vi.fn(),
}));
vi.mock("../../src/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/api/client")>("../../src/lib/api/client");
  return {
    ...actual,
    fetchYcBatches: mockFetchYcBatches,
    fetchBatchDetail: mockFetchBatchDetail,
    evaluateBatch: mockEvaluateBatch,
  };
});

const { BatchDashboard } = await import("../../src/components/dashboard/BatchDashboard");

const evaluatedSummer = {
  slug: "summer-2026",
  displayName: "Summer 2026",
  mirrorCompanyCount: 54,
  ourCompanyCount: 54,
  alreadyEvaluated: true,
  hasNewCompanies: false,
};

const freshFall = {
  slug: "fall-2026",
  displayName: "Fall 2026",
  mirrorCompanyCount: 4,
  ourCompanyCount: 0,
  alreadyEvaluated: false,
  hasNewCompanies: true,
};

const grownSummer = {
  ...evaluatedSummer,
  mirrorCompanyCount: 60,
  hasNewCompanies: true,
};

describe("BatchDashboard", () => {
  beforeEach(() => {
    mockFetchYcBatches.mockReset();
    mockFetchBatchDetail.mockReset();
    mockEvaluateBatch.mockReset();
  });

  it("shows an error message if the yc batch list fails to load", async () => {
    mockFetchYcBatches.mockRejectedValueOnce(new ApiError("database unreachable", 500));
    render(<BatchDashboard />);
    await waitFor(() => expect(screen.getByText("database unreachable")).toBeInTheDocument());
  });

  it("reframes the raw DATABASE_URL-not-set error in plainer language, without hiding the technical detail", async () => {
    mockFetchYcBatches.mockRejectedValueOnce(new ApiError("DATABASE_URL is not set", 500));
    render(<BatchDashboard />);
    await waitFor(() =>
      expect(screen.getByText("This app isn't connected to a database yet. (DATABASE_URL is not set)")).toBeInTheDocument()
    );
  });

  it("defaults to the first already-evaluated batch and renders its ranked companies", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([freshFall, evaluatedSummer]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);

    render(<BatchDashboard />);

    await waitFor(() => expect(mockFetchBatchDetail).toHaveBeenCalledWith("summer-2026"));
    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "All Companies" })).toBeInTheDocument();
    expect(screen.getByText("Thesis Fit")).toBeInTheDocument(); // category badge on the card
  });

  it("falls back to the first batch overall (even if never evaluated) when nothing has been evaluated yet", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([freshFall]);
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("No batch found", 404));

    render(<BatchDashboard />);

    await waitFor(() => expect(mockFetchBatchDetail).toHaveBeenCalledWith("fall-2026"));
    // The banner covers "not yet evaluated" messaging for this case — the
    // standalone fallback text is intentionally suppressed when the
    // banner is already showing, to avoid saying the same thing twice.
    await waitFor(() => expect(screen.getByText(/Fall 2026 — 4 companies so far/)).toBeInTheDocument());
  });

  it("treats a 404 from the detail endpoint as 'not yet evaluated', not an error", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([freshFall]);
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("No batch found with id \"fall-2026\".", 404));

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText(/Fall 2026 — 4 companies so far/)).toBeInTheDocument());
    expect(screen.queryByText(/No batch found/)).not.toBeInTheDocument();
  });

  it("shows a real error (not the 'not yet evaluated' message) for a non-404 detail failure", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([evaluatedSummer]);
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("something else broke", 500));

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText("something else broke")).toBeInTheDocument());
  });

  it("re-fetches detail when switching batches via the dropdown", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([freshFall, evaluatedSummer]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail); // initial load (summer-2026, the default)
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("No batch found", 404)); // after switching to fall-2026

    const user = userEvent.setup();
    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());

    const select = screen.getByLabelText("Select batch");
    await user.selectOptions(select, "fall-2026");

    await waitFor(() => expect(mockFetchBatchDetail).toHaveBeenCalledWith("fall-2026"));
    await waitFor(() => expect(screen.queryByText("Florin")).not.toBeInTheDocument());
  });

  it("puts not-yet-scored companies behind a collapsed disclosure, with a reason, not in the main ranked list", async () => {
    const unrankedCo = { ...sampleCompactCompany, slug: "quiet-co", name: "Quiet Co", primaryCategory: null };
    mockFetchYcBatches.mockResolvedValueOnce([evaluatedSummer]);
    mockFetchBatchDetail.mockResolvedValueOnce({ ...sampleBatchDetail, ranked: [], unranked: [unrankedCo] });

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText(/1 not yet evaluated/)).toBeInTheDocument());
    expect(screen.getByText(/Scout hasn't been able to look into these companies yet/)).toBeInTheDocument();
    const disclosure = screen.getByText(/1 not yet evaluated/).closest("details");
    expect(disclosure).not.toHaveAttribute("open");
  });

  it("shows a banner offering to evaluate a batch that's never been evaluated at all", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([freshFall]);
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("No batch found", 404));

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText(/Fall 2026 — 4 companies so far/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Evaluate this batch" })).toBeInTheDocument();
  });

  it("shows a 'refresh' banner for an already-evaluated batch that has grown, alongside its existing ranked list", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([grownSummer]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText(/Summer 2026 has 6 new companies/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument()); // existing ranked list still shows
  });

  it("does not show any banner for a batch that's fully up to date", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([evaluatedSummer]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Evaluate this batch" })).not.toBeInTheDocument();
  });

  it("clicking 'Evaluate this batch' starts the evaluation and switches to a progress view", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([freshFall]);
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("No batch found", 404));
    mockEvaluateBatch.mockResolvedValueOnce({ ok: true, message: "Started." });
    // Progress view polls fetchBatchDetail immediately for the batch too.
    mockFetchBatchDetail.mockRejectedValue(new ApiError("No batch found", 404));

    const user = userEvent.setup();
    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluate this batch" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Evaluate this batch" }));

    expect(mockEvaluateBatch).toHaveBeenCalledWith("Fall 2026");
    await waitFor(() => expect(screen.getByText(/Evaluating Fall 2026/)).toBeInTheDocument());
    // The banner itself should be gone once evaluation has started.
    expect(screen.queryByRole("button", { name: "Evaluate this batch" })).not.toBeInTheDocument();
  });

  it("shows an error on the banner rather than crashing if starting evaluation fails", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([freshFall]);
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("No batch found", 404));
    mockEvaluateBatch.mockRejectedValueOnce(new ApiError("GITHUB_TOKEN is not set", 500));

    const user = userEvent.setup();
    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluate this batch" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Evaluate this batch" }));

    await waitFor(() => expect(screen.getByText("GITHUB_TOKEN is not set")).toBeInTheDocument());
    // Still offering the button — the user can retry.
    expect(screen.getByRole("button", { name: "Evaluate this batch" })).toBeInTheDocument();
  });

  it("refreshes the yc batch list and re-fetches detail once evaluation completes", async () => {
    mockFetchYcBatches.mockResolvedValueOnce([freshFall]);
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("No batch found", 404));
    mockEvaluateBatch.mockResolvedValueOnce({ ok: true, message: "Started." });
    // The progress view's first poll (synchronous on mount) already shows
    // every company attempted, so onDone fires right away — this test
    // checks the end-to-end refresh outcome, not the transient
    // "Evaluating…" state itself, which EvaluationProgress's own
    // dedicated tests already cover.
    mockFetchBatchDetail.mockResolvedValueOnce({
      batch: sampleBatchDetail.batch,
      ranked: [sampleCompactCompany, sampleCompactCompany, sampleCompactCompany, sampleCompactCompany],
      unranked: [],
    });
    mockFetchYcBatches.mockResolvedValueOnce([{ ...freshFall, alreadyEvaluated: true, ourCompanyCount: 4, hasNewCompanies: false }]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail); // final reload after done

    const user = userEvent.setup();
    render(<BatchDashboard />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluate this batch" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Evaluate this batch" }));

    // End state: back to a normal ranked view, no evaluate button left
    // (the batch is now up to date), and the yc batch list was refreshed.
    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Evaluate this batch" })).not.toBeInTheDocument();
    expect(mockFetchYcBatches).toHaveBeenCalledTimes(2);
  });
});
