// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleBatch, sampleBatchDetail, sampleCompactCompany } from "./fixtures";
import { ApiError } from "../../src/lib/api/client";

const { mockFetchBatches, mockFetchBatchDetail, mockFetchLatestYcBatch, mockEvaluateBatch } = vi.hoisted(() => ({
  mockFetchBatches: vi.fn(),
  mockFetchBatchDetail: vi.fn(),
  mockFetchLatestYcBatch: vi.fn(),
  mockEvaluateBatch: vi.fn(),
}));
vi.mock("../../src/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/api/client")>("../../src/lib/api/client");
  return {
    ...actual,
    fetchBatches: mockFetchBatches,
    fetchBatchDetail: mockFetchBatchDetail,
    fetchLatestYcBatch: mockFetchLatestYcBatch,
    evaluateBatch: mockEvaluateBatch,
  };
});

const { BatchDashboard } = await import("../../src/components/dashboard/BatchDashboard");

describe("BatchDashboard", () => {
  beforeEach(() => {
    mockFetchBatches.mockReset();
    mockFetchBatchDetail.mockReset();
    mockFetchLatestYcBatch.mockReset();
    mockEvaluateBatch.mockReset();
    // Most tests don't care about the "new batch available" banner —
    // default to "nothing new" so it stays out of the way unless a test
    // explicitly configures it.
    mockFetchLatestYcBatch.mockResolvedValue({ slug: "summer-2026", displayName: "Summer 2026", companyCount: 54, alreadyEvaluated: true });
  });

  it("shows an empty-state message with the pipeline command when no batches exist", async () => {
    mockFetchBatches.mockResolvedValueOnce([]);
    render(<BatchDashboard />);
    await waitFor(() => expect(screen.getByText("No batches evaluated yet.")).toBeInTheDocument());
    expect(screen.getByText(/npm run pipeline/)).toBeInTheDocument();
    expect(mockFetchBatchDetail).not.toHaveBeenCalled();
  });

  it("shows an error message if the batch list fails to load", async () => {
    mockFetchBatches.mockRejectedValueOnce(new ApiError("database unreachable", 500));
    render(<BatchDashboard />);
    await waitFor(() => expect(screen.getByText("database unreachable")).toBeInTheDocument());
  });

  it("reframes the raw DATABASE_URL-not-set error in plainer language, without hiding the technical detail", async () => {
    mockFetchBatches.mockRejectedValueOnce(new ApiError("DATABASE_URL is not set", 500));
    render(<BatchDashboard />);
    await waitFor(() =>
      expect(screen.getByText("This app isn't connected to a database yet. (DATABASE_URL is not set)")).toBeInTheDocument()
    );
  });

  it("defaults to the first (most recent) batch and renders its ranked companies", async () => {
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);

    render(<BatchDashboard />);

    await waitFor(() => expect(mockFetchBatchDetail).toHaveBeenCalledWith("summer-2026"));
    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "All Companies" })).toBeInTheDocument();
    expect(screen.getByText("Activant Thesis Fit")).toBeInTheDocument(); // category badge on the card
  });

  it("shows an error message if the batch detail fails to load", async () => {
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockRejectedValueOnce(new ApiError("no batch found", 404));

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText("no batch found")).toBeInTheDocument());
  });

  it("re-fetches detail when switching batches via the dropdown", async () => {
    const secondBatch = { ...sampleBatch, id: "winter-2027", displayName: "Winter 2027" };
    mockFetchBatches.mockResolvedValueOnce([sampleBatch, secondBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail); // initial load (summer-2026)
    mockFetchBatchDetail.mockResolvedValueOnce({ ...sampleBatchDetail, batch: secondBatch, ranked: [] }); // after switching

    const user = userEvent.setup();
    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());

    const select = screen.getByLabelText("Select batch");
    await user.selectOptions(select, "winter-2027");

    await waitFor(() => expect(mockFetchBatchDetail).toHaveBeenCalledWith("winter-2027"));
    await waitFor(() => expect(screen.queryByText("Florin")).not.toBeInTheDocument());
  });

  it("puts not-yet-scored companies behind a collapsed disclosure, with a reason, not in the main ranked list", async () => {
    const unrankedCo = { ...sampleCompactCompany, slug: "quiet-co", name: "Quiet Co", primaryCategory: null };
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce({ ...sampleBatchDetail, ranked: [], unranked: [unrankedCo] });

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText(/1 not yet evaluated/)).toBeInTheDocument());
    expect(screen.getByText(/Scout hasn't been able to look into these companies yet/)).toBeInTheDocument();
    // Collapsed by default — the <details> element itself carries the
    // collapsed/expanded state; jsdom doesn't reliably apply the
    // browser's native content-hiding CSS, so check the semantic state
    // directly rather than whether the text is findable in the DOM.
    const disclosure = screen.getByText(/1 not yet evaluated/).closest("details");
    expect(disclosure).not.toHaveAttribute("open");
  });

  it("shows a banner offering to evaluate a newer batch YC has that we haven't scored yet", async () => {
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);
    mockFetchLatestYcBatch.mockReset();
    mockFetchLatestYcBatch.mockResolvedValueOnce({ slug: "fall-2026", displayName: "Fall 2026", companyCount: 4, alreadyEvaluated: false });

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText(/Fall 2026 just dropped/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Evaluate this batch" })).toBeInTheDocument();
  });

  it("does not show the banner once the latest YC batch has already been evaluated", async () => {
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);
    mockFetchLatestYcBatch.mockReset();
    mockFetchLatestYcBatch.mockResolvedValueOnce({ slug: "summer-2026", displayName: "Summer 2026", companyCount: 54, alreadyEvaluated: true });

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());
    expect(screen.queryByText(/just dropped/)).not.toBeInTheDocument();
  });

  it("clicking 'Evaluate this batch' starts the evaluation and switches to a progress view", async () => {
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);
    mockFetchLatestYcBatch.mockReset();
    mockFetchLatestYcBatch.mockResolvedValueOnce({ slug: "fall-2026", displayName: "Fall 2026", companyCount: 4, alreadyEvaluated: false });
    mockEvaluateBatch.mockResolvedValueOnce({ ok: true, message: "Started." });
    // Progress view polls fetchBatchDetail immediately for the new batch too.
    mockFetchBatchDetail.mockResolvedValue({ batch: sampleBatch, ranked: [], unranked: [] });

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
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);
    mockFetchLatestYcBatch.mockReset();
    mockFetchLatestYcBatch.mockResolvedValueOnce({ slug: "fall-2026", displayName: "Fall 2026", companyCount: 4, alreadyEvaluated: false });
    mockEvaluateBatch.mockRejectedValueOnce(new ApiError("GITHUB_TOKEN is not set", 500));

    const user = userEvent.setup();
    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluate this batch" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Evaluate this batch" }));

    await waitFor(() => expect(screen.getByText("GITHUB_TOKEN is not set")).toBeInTheDocument());
    // Still offering the button — the user can retry.
    expect(screen.getByRole("button", { name: "Evaluate this batch" })).toBeInTheDocument();
  });
});
