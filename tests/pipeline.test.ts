import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./fixtures/fakeDb";
import { sampleThesis } from "./fixtures/testData";

vi.mock("../src/lib/yc/ingest", () => ({ ingestBatch: vi.fn() }));
vi.mock("../src/lib/scoring/triage", () => ({ scoreTriage: vi.fn() }));
vi.mock("../src/lib/scoring/deepDive", () => ({ scoreDeepDive: vi.fn() }));

const { runBatchPipeline } = await import("../src/lib/pipeline/runBatchPipeline");
const { ingestBatch } = await import("../src/lib/yc/ingest");
const { scoreTriage } = await import("../src/lib/scoring/triage");
const { scoreDeepDive } = await import("../src/lib/scoring/deepDive");
const { getCompanyBySlug } = await import("../src/lib/db/repository");

function company(slug: string, name: string) {
  return {
    ycId: 1,
    slug,
    name,
    oneLiner: `${name} one-liner`,
    longDescription: "desc",
    website: "https://example.com",
    ycUrl: `https://www.ycombinator.com/companies/${slug}`,
    status: "Active",
    teamSize: 2,
    industries: ["B2B"],
    tags: [],
    regions: [],
    launchedAt: new Date(),
    batchSlug: "summer-2026",
    batchDisplayName: "Summer 2026",
    founders: [],
  };
}

function score(overrides: Partial<{ team: number; thesis: number; category: "team_general" | "thesis_fit" | null }> = {}) {
  return {
    pass: "triage" as const,
    teamGeneralScore: overrides.team ?? 5,
    thesisAlignScore: overrides.thesis ?? 5,
    primaryCategory: overrides.category ?? null,
    secondaryTag: false,
    summary: "summary",
    rubricBreakdown: { team_general: [], thesis_fit: [] },
    thesisVersionSource: "manual",
    thesisFetchedAt: new Date(),
  };
}

describe("runBatchPipeline", () => {
  beforeEach(() => {
    vi.mocked(ingestBatch).mockReset();
    vi.mocked(scoreTriage).mockReset();
    vi.mocked(scoreDeepDive).mockReset();
  });

  it("persists every ingested company with its triage score when nobody clears the deep-dive bar", async () => {
    vi.mocked(ingestBatch).mockResolvedValue([company("a", "Company A"), company("b", "Company B")]);
    vi.mocked(scoreTriage).mockResolvedValue(score({ team: 4, thesis: 4 }));

    const db = createFakeDb();
    const result = await runBatchPipeline(db, "Summer 2026", sampleThesis, { deepDiveBar: 6.5 });

    expect(result.processed).toBe(2);
    expect(scoreDeepDive).not.toHaveBeenCalled();
    const stored = await getCompanyBySlug(db, "a");
    expect(stored?.score?.pass).toBe("triage");
  });

  it("deep-dives only companies whose triage score clears the bar on either axis", async () => {
    vi.mocked(ingestBatch).mockResolvedValue([company("low", "Low Co"), company("high", "High Co")]);
    vi.mocked(scoreTriage).mockImplementation(async ({ company: c }) =>
      c.slug === "high" ? score({ team: 9, thesis: 3 }) : score({ team: 4, thesis: 4 })
    );
    vi.mocked(scoreDeepDive).mockResolvedValue({
      ...score({ team: 9.5, thesis: 3, category: "team_general" }),
      pass: "deep_dive",
      websiteAccessible: true,
      websiteCheckNote: undefined,
    });

    const db = createFakeDb();
    await runBatchPipeline(db, "Summer 2026", sampleThesis, { deepDiveBar: 6.5 });

    expect(scoreDeepDive).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scoreDeepDive).mock.calls[0]?.[0].company.slug).toBe("high");

    const low = await getCompanyBySlug(db, "low");
    const high = await getCompanyBySlug(db, "high");
    expect(low?.score?.pass).toBe("triage");
    expect(high?.score?.pass).toBe("deep_dive");
    expect(high?.websiteAccessible).toBe(true);
  });

  it("respects the limit option, processing only the first N companies", async () => {
    vi.mocked(ingestBatch).mockResolvedValue([company("a", "A"), company("b", "B"), company("c", "C")]);
    vi.mocked(scoreTriage).mockResolvedValue(score());

    const db = createFakeDb();
    const result = await runBatchPipeline(db, "Summer 2026", sampleThesis, { limit: 2 });

    expect(result.processed).toBe(2);
    expect(scoreTriage).toHaveBeenCalledTimes(2);
  });

  it("reports progress events in order: ingesting, ingested, then scoring/scored per company, then done", async () => {
    vi.mocked(ingestBatch).mockResolvedValue([company("a", "A")]);
    vi.mocked(scoreTriage).mockResolvedValue(score());

    const events: string[] = [];
    const db = createFakeDb();
    await runBatchPipeline(db, "Summer 2026", sampleThesis, { onProgress: (e) => events.push(e.type) });

    expect(events).toEqual(["ingesting", "ingested", "scoring", "scored", "done"]);
  });

  it("records the batch's full ingested count even when limit truncates what gets scored", async () => {
    vi.mocked(ingestBatch).mockResolvedValue([company("a", "A"), company("b", "B")]);
    vi.mocked(scoreTriage).mockResolvedValue(score());

    const db = createFakeDb();
    await runBatchPipeline(db, "Summer 2026", sampleThesis, { limit: 1 });

    const { listBatchesFromDb } = await import("../src/lib/db/repository");
    const batches = await listBatchesFromDb(db);
    expect(batches[0]?.companyCount).toBe(2); // full batch size, not the limited 1
  });

  it("continues past a single company's scoring failure rather than aborting the whole run", async () => {
    // Real bug this guards against: company #4 of a 62-company batch threw
    // on a malformed model response, and an earlier all-or-nothing version
    // threw away 3 already-scored companies and never attempted the
    // remaining 58.
    vi.mocked(ingestBatch).mockResolvedValue([company("a", "A"), company("bad", "Bad Co"), company("c", "C")]);
    vi.mocked(scoreTriage).mockImplementation(async ({ company: c }) => {
      if (c.slug === "bad") throw new Error("record_score input is missing \"team_general\"");
      return score();
    });

    const db = createFakeDb();
    const result = await runBatchPipeline(db, "Summer 2026", sampleThesis, {});

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failedCompanies).toEqual(["Bad Co"]);
    expect(await getCompanyBySlug(db, "a")).toMatchObject({ score: { pass: "triage" } });
    expect(await getCompanyBySlug(db, "c")).toMatchObject({ score: { pass: "triage" } });
  });

  it("emits a 'failed' progress event with the error message when a company's scoring throws", async () => {
    vi.mocked(ingestBatch).mockResolvedValue([company("bad", "Bad Co")]);
    vi.mocked(scoreTriage).mockRejectedValue(new Error("boom"));

    const events: Array<{ type: string; error?: string }> = [];
    const db = createFakeDb();
    await runBatchPipeline(db, "Summer 2026", sampleThesis, { onProgress: (e) => events.push(e) });

    const failedEvent = events.find((e) => e.type === "failed");
    expect(failedEvent?.error).toBe("boom");
    const doneEvent = events.find((e) => e.type === "done") as { failed?: number } | undefined;
    expect(doneEvent?.failed).toBe(1);
  });
});
