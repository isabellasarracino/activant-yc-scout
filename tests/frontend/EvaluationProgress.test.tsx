// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockFetchBatchDetail = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/api/client")>("../../src/lib/api/client");
  return { ...actual, fetchBatchDetail: mockFetchBatchDetail };
});

const { EvaluationProgress } = await import("../../src/components/dashboard/EvaluationProgress");

function detail(rankedCount: number, unrankedCount: number) {
  return {
    batch: { id: "fall-2026", displayName: "Fall 2026", companyCount: null, firstSyncedAt: "", lastSyncedAt: "" },
    ranked: Array.from({ length: rankedCount }, (_, i) => ({ slug: `r${i}` })),
    unranked: Array.from({ length: unrankedCount }, (_, i) => ({ slug: `u${i}` })),
  };
}

describe("EvaluationProgress", () => {
  beforeEach(() => {
    mockFetchBatchDetail.mockReset();
  });

  it("shows a starting message before any companies have been seen", async () => {
    mockFetchBatchDetail.mockResolvedValue(detail(0, 0));
    render(<EvaluationProgress batchSlug="fall-2026" displayName="Fall 2026" expectedCompanyCount={4} onDone={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Starting up/)).toBeInTheDocument());
  });

  it("shows real progress counts once companies start appearing", async () => {
    mockFetchBatchDetail.mockResolvedValue(detail(1, 1));
    render(<EvaluationProgress batchSlug="fall-2026" displayName="Fall 2026" expectedCompanyCount={4} onDone={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/2 of 4 companies seen, 1 scored — 50%/)).toBeInTheDocument());
  });

  it("tolerates a 404 (batch not ingested yet) quietly, without showing an error", async () => {
    mockFetchBatchDetail.mockRejectedValue(new Error("No batch found"));
    render(<EvaluationProgress batchSlug="fall-2026" displayName="Fall 2026" expectedCompanyCount={4} onDone={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Starting up/)).toBeInTheDocument());
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("calls onDone once every company has been attempted (ranked + unranked reaches the expected count)", async () => {
    mockFetchBatchDetail.mockResolvedValueOnce(detail(4, 0));
    const onDone = vi.fn();
    render(<EvaluationProgress batchSlug="fall-2026" displayName="Fall 2026" expectedCompanyCount={4} onDone={onDone} />);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("does NOT call onDone just because unranked is nonzero — some companies may have genuinely failed and stay unranked forever", async () => {
    // 3 ranked + 1 unranked = 4 = expected count -> this IS done (every
    // company attempted), even though unranked isn't zero.
    mockFetchBatchDetail.mockResolvedValueOnce(detail(3, 1));
    const onDone = vi.fn();
    render(<EvaluationProgress batchSlug="fall-2026" displayName="Fall 2026" expectedCompanyCount={4} onDone={onDone} />);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("keeps polling (does not call onDone) while fewer companies have been seen than expected", async () => {
    mockFetchBatchDetail.mockResolvedValue(detail(1, 1));
    const onDone = vi.fn();
    render(<EvaluationProgress batchSlug="fall-2026" displayName="Fall 2026" expectedCompanyCount={4} onDone={onDone} />);

    await waitFor(() => expect(mockFetchBatchDetail).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows the batch's display name in the heading", async () => {
    mockFetchBatchDetail.mockResolvedValue(detail(0, 0));
    render(<EvaluationProgress batchSlug="fall-2026" displayName="Fall 2026" expectedCompanyCount={4} onDone={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Evaluating Fall 2026/)).toBeInTheDocument());
  });
});
