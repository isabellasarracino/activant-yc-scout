// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sampleBatch, sampleBatchDetail, sampleCompactCompany } from "./fixtures";
import { ApiError } from "../../src/lib/api/client";

const { mockFetchBatches, mockFetchBatchDetail } = vi.hoisted(() => ({
  mockFetchBatches: vi.fn(),
  mockFetchBatchDetail: vi.fn(),
}));
vi.mock("../../src/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/api/client")>("../../src/lib/api/client");
  return { ...actual, fetchBatches: mockFetchBatches, fetchBatchDetail: mockFetchBatchDetail };
});

const { BatchDashboard } = await import("../../src/components/dashboard/BatchDashboard");

describe("BatchDashboard", () => {
  beforeEach(() => {
    mockFetchBatches.mockReset();
    mockFetchBatchDetail.mockReset();
  });

  it("shows an empty-state message with the pipeline command when no batches exist", async () => {
    mockFetchBatches.mockResolvedValueOnce([]);
    render(<BatchDashboard />);
    await waitFor(() => expect(screen.getByText("No batches ingested yet.")).toBeInTheDocument());
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

  it("defaults to the first (most recent) batch and renders its companies grouped by category", async () => {
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce(sampleBatchDetail);

    render(<BatchDashboard />);

    await waitFor(() => expect(mockFetchBatchDetail).toHaveBeenCalledWith("summer-2026"));
    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Activant Thesis Fit" })).toBeInTheDocument();
    expect(screen.getByText("No companies have qualified on team/general interest yet.")).toBeInTheDocument();
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
    mockFetchBatchDetail.mockResolvedValueOnce({ ...sampleBatchDetail, batch: secondBatch, thesisFit: [] }); // after switching

    const user = userEvent.setup();
    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText("Florin")).toBeInTheDocument());

    const select = screen.getByLabelText("Select batch");
    await user.selectOptions(select, "winter-2027");

    await waitFor(() => expect(mockFetchBatchDetail).toHaveBeenCalledWith("winter-2027"));
    await waitFor(() => expect(screen.queryByText("Florin")).not.toBeInTheDocument());
  });

  it("puts unranked companies behind a collapsed disclosure, not in the main grids", async () => {
    const unrankedCo = { ...sampleCompactCompany, slug: "quiet-co", name: "Quiet Co", primaryCategory: null };
    mockFetchBatches.mockResolvedValueOnce([sampleBatch]);
    mockFetchBatchDetail.mockResolvedValueOnce({ ...sampleBatchDetail, thesisFit: [], unranked: [unrankedCo] });

    render(<BatchDashboard />);

    await waitFor(() => expect(screen.getByText(/1 unranked/)).toBeInTheDocument());
    // Collapsed by default — the <details> element itself carries the
    // collapsed/expanded state; jsdom doesn't reliably apply the
    // browser's native content-hiding CSS, so check the semantic state
    // directly rather than whether the text is findable in the DOM.
    const disclosure = screen.getByText(/1 unranked/).closest("details");
    expect(disclosure).not.toHaveAttribute("open");
  });
});
