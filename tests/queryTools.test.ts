import { describe, expect, it } from "vitest";
import { createFakeDb } from "./fixtures/fakeDb";
import { sampleCompany, sampleThesis, fullRawScore } from "./fixtures/testData";
import { upsertBatch, upsertCompanyWithFounders, upsertScore } from "../src/lib/db/repository";
import { buildScoreResult } from "../src/lib/scoring/scoreTool";
import { getCompanyDetail, listBatchesSummary, listTopCompanies, searchCompanies } from "../src/lib/chat/queryTools";
import type { NormalizedCompany } from "../src/lib/yc/types";

const lowThesis = { sector_alignment: 2, business_model_fit: 2, research_alignment: 2, category_potential: 2 };
const highThesis = { sector_alignment: 9, business_model_fit: 9, research_alignment: 9, category_potential: 9 };
const lowTeam = { founder_market_fit: 2, founder_track_record: 2, team_completeness: 2, idea_quality: 2, execution_signal: 2 };
const highTeam = { founder_market_fit: 9, founder_track_record: 9, team_completeness: 9, idea_quality: 9, execution_signal: 9 };

/** Seeds two batches with a handful of distinctly-scored, distinctly-named companies for the tests below to search/rank over. */
async function seedDb() {
  const db = createFakeDb();
  const summer = await upsertBatch(db, "Summer 2026", 3);
  const winter = await upsertBatch(db, "Winter 2027", 1);

  const florin: NormalizedCompany = { ...sampleCompany, slug: "florin", name: "Florin", oneLiner: "Banking for startups.", tags: ["Banking as a Service"], industries: ["Fintech"] };
  const { id: florinId } = await upsertCompanyWithFounders(db, summer.id, florin);
  await upsertScore(db, florinId, buildScoreResult(fullRawScore({ team: lowTeam, thesisScores: highThesis }), "triage", sampleThesis)); // thesis_fit primary

  const acme: NormalizedCompany = { ...sampleCompany, slug: "acme-robotics", name: "Acme Robotics", oneLiner: "Warehouse picking robots.", tags: ["Robotics"], industries: ["Supply Chain"] };
  const { id: acmeId } = await upsertCompanyWithFounders(db, summer.id, acme);
  await upsertScore(db, acmeId, buildScoreResult(fullRawScore({ team: highTeam, thesisScores: lowThesis }), "triage", sampleThesis)); // team_general primary, strong

  const unscored: NormalizedCompany = { ...sampleCompany, slug: "quiet-co", name: "Quiet Co", oneLiner: "Stealth mode, nothing public yet." };
  await upsertCompanyWithFounders(db, summer.id, unscored); // no score at all

  const winterCo: NormalizedCompany = { ...sampleCompany, slug: "winter-payments", name: "Winter Payments", oneLiner: "Payments infra for the winter batch." };
  const { id: winterCoId } = await upsertCompanyWithFounders(db, winter.id, winterCo);
  await upsertScore(db, winterCoId, buildScoreResult(fullRawScore({ team: highTeam, thesisScores: highThesis }), "deep_dive", sampleThesis)); // both axes qualify equally -> thesis_fit primary by the documented tie-break

  return { db, summer, winter };
}

describe("listBatchesSummary", () => {
  it("returns every batch with a plain-serializable date", async () => {
    const { db } = await seedDb();
    const batches = await listBatchesSummary(db);
    expect(batches.map((b) => b.displayName).sort()).toEqual(["Summer 2026", "Winter 2027"]);
    expect(typeof batches[0]?.lastSyncedAt).toBe("string");
  });
});

describe("searchCompanies", () => {
  it("finds a company by a case-insensitive name substring", async () => {
    const { db } = await seedDb();
    const results = await searchCompanies(db, { query: "flor" });
    expect(results.map((r) => r.slug)).toContain("florin");
  });

  it("also matches on one-liner and tags when the name doesn't match", async () => {
    const { db } = await seedDb();
    const results = await searchCompanies(db, { query: "warehouse" });
    expect(results.map((r) => r.slug)).toContain("acme-robotics");
  });

  it("ranks a name hit above a one-liner-only hit", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 2);
    // "payments" only in the one-liner for one company, in the name for the other.
    const a = await upsertCompanyWithFounders(db, batch.id, { ...sampleCompany, slug: "a", name: "Alpha", oneLiner: "We do payments." });
    const b = await upsertCompanyWithFounders(db, batch.id, { ...sampleCompany, slug: "b", name: "Payments Inc", oneLiner: "Something else entirely." });
    await upsertScore(db, a.id, buildScoreResult(fullRawScore(), "triage", sampleThesis));
    await upsertScore(db, b.id, buildScoreResult(fullRawScore(), "triage", sampleThesis));

    const results = await searchCompanies(db, { query: "payments" });
    expect(results[0]?.slug).toBe("b");
  });

  it("scopes results to a batch when batchId is given", async () => {
    const { db, summer } = await seedDb();
    const results = await searchCompanies(db, { query: "payments", batchId: summer.id });
    expect(results).toEqual([]); // "Winter Payments" is in the other batch
  });

  it("returns an empty array rather than throwing when nothing matches", async () => {
    const { db } = await seedDb();
    const results = await searchCompanies(db, { query: "nonexistent-zzz" });
    expect(results).toEqual([]);
  });

  it("returns unscored companies too — chat/search isn't limited to categorized ones", async () => {
    const { db } = await seedDb();
    const results = await searchCompanies(db, { query: "quiet" });
    expect(results[0]).toMatchObject({ slug: "quiet-co", primaryCategory: null, teamGeneralScore: null });
  });

  it("respects a custom limit", async () => {
    const { db } = await seedDb();
    const results = await searchCompanies(db, { query: "" /* blank matches everything, scoped by limit */, limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("attaches the human-readable batch display name, not just the batch id", async () => {
    const { db } = await seedDb();
    const results = await searchCompanies(db, { query: "florin" });
    expect(results[0]?.batch).toBe("Summer 2026");
  });
});

describe("listTopCompanies", () => {
  it("ranks by the stronger axis by default (category: any)", async () => {
    const { db } = await seedDb();
    const top = await listTopCompanies(db, {});
    // Acme (strong team_general) and Florin (strong thesis_fit) should outrank the unscored company entirely.
    expect(top.map((c) => c.slug)).toContain("acme-robotics");
    expect(top.map((c) => c.slug)).not.toContain("quiet-co");
  });

  it("filters to one category and ranks by that category's score specifically", async () => {
    const { db } = await seedDb();
    const top = await listTopCompanies(db, { category: "team_general" });
    expect(top.every((c) => c.primaryCategory === "team_general")).toBe(true);
    expect(top.map((c) => c.slug)).toContain("acme-robotics");
    expect(top.map((c) => c.slug)).not.toContain("florin"); // florin is thesis_fit-primary
  });

  it("excludes companies with no score at all", async () => {
    const { db } = await seedDb();
    const top = await listTopCompanies(db, { limit: 50 });
    expect(top.map((c) => c.slug)).not.toContain("quiet-co");
  });

  it("scopes to a batch when batchId is given", async () => {
    const { db, winter } = await seedDb();
    const top = await listTopCompanies(db, { batchId: winter.id });
    expect(top.map((c) => c.slug)).toEqual(["winter-payments"]);
  });

  it("respects a custom limit", async () => {
    const { db } = await seedDb();
    const top = await listTopCompanies(db, { limit: 1 });
    expect(top).toHaveLength(1);
  });
});

describe("getCompanyDetail", () => {
  it("returns full detail including founders and the rubric breakdown", async () => {
    const { db } = await seedDb();
    const detail = await getCompanyDetail(db, "florin");
    expect(detail?.name).toBe("Florin");
    expect(detail?.founders[0]?.name).toBe("Shaurya Aggarwal");
    expect(detail?.rubricBreakdown).toBeDefined();
    expect(detail?.batch).toBe("Summer 2026");
  });

  it("returns null for an unknown slug rather than throwing", async () => {
    const { db } = await seedDb();
    const detail = await getCompanyDetail(db, "does-not-exist");
    expect(detail).toBeNull();
  });

  it("returns detail for an unscored company with null score fields, not an error", async () => {
    const { db } = await seedDb();
    const detail = await getCompanyDetail(db, "quiet-co");
    expect(detail?.primaryCategory).toBeNull();
    expect(detail?.rubricBreakdown).toBeNull();
  });
});
