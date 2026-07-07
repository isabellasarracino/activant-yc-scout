import { describe, expect, it } from "vitest";
import { createFakeDb } from "./fixtures/fakeDb";
import { sampleCompany, sampleThesis, fullRawScore } from "./fixtures/testData";
import {
  rankCompaniesForDisplay,
  getCompanyBySlug,
  listAllCompaniesWithRelations,
  listBatchesFromDb,
  listCompaniesInBatch,
  upsertBatch,
  upsertCompanyWithFounders,
  upsertScore,
} from "../src/lib/db/repository";
import { buildScoreResult } from "../src/lib/scoring/scoreTool";
import type { NormalizedCompany } from "../src/lib/yc/types";

describe("upsertBatch", () => {
  it("creates a batch and slugifies the id from the display name", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 54);
    expect(batch.id).toBe("summer-2026");
    expect(batch.displayName).toBe("Summer 2026");
    expect(batch.companyCount).toBe(54);
  });

  it("is idempotent — calling it again updates the count rather than creating a second row", async () => {
    const db = createFakeDb();
    await upsertBatch(db, "Summer 2026", 54);
    await upsertBatch(db, "Summer 2026", 61);
    const batches = await listBatchesFromDb(db);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.companyCount).toBe(61);
  });
});

describe("upsertCompanyWithFounders", () => {
  it("creates a company with its founders", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    await upsertCompanyWithFounders(db, batch.id, sampleCompany);

    const stored = await getCompanyBySlug(db, sampleCompany.slug);
    expect(stored?.name).toBe("Florin");
    expect(stored?.founders).toHaveLength(1);
    expect(stored?.founders[0]?.name).toBe("Shaurya Aggarwal");
  });

  it("is idempotent on slug — re-ingesting doesn't create a duplicate company", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    await upsertCompanyWithFounders(db, batch.id, sampleCompany);
    await upsertCompanyWithFounders(db, batch.id, { ...sampleCompany, oneLiner: "Updated one-liner" });

    const all = await listCompaniesInBatch(db, batch.id);
    expect(all).toHaveLength(1);
    expect(all[0]?.oneLiner).toBe("Updated one-liner");
  });

  it("replaces founders rather than accumulating them across re-ingests", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    await upsertCompanyWithFounders(db, batch.id, sampleCompany);

    const updated: NormalizedCompany = {
      ...sampleCompany,
      founders: [{ name: "A New Founder" }],
    };
    await upsertCompanyWithFounders(db, batch.id, updated);

    const stored = await getCompanyBySlug(db, sampleCompany.slug);
    expect(stored?.founders).toHaveLength(1);
    expect(stored?.founders[0]?.name).toBe("A New Founder");
  });

  it("handles a company with zero founders without erroring", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    const noFounders: NormalizedCompany = { ...sampleCompany, founders: [] };
    await upsertCompanyWithFounders(db, batch.id, noFounders);
    const stored = await getCompanyBySlug(db, sampleCompany.slug);
    expect(stored?.founders).toEqual([]);
  });
});

describe("upsertScore", () => {
  it("attaches a score to a company, retrievable via getCompanyBySlug", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    const { id: companyId } = await upsertCompanyWithFounders(db, batch.id, sampleCompany);

    const score = buildScoreResult(fullRawScore(), "triage", sampleThesis);
    await upsertScore(db, companyId, score);

    const stored = await getCompanyBySlug(db, sampleCompany.slug);
    expect(stored?.score?.pass).toBe("triage");
    expect(stored?.score?.teamGeneralScore).toBe(score.teamGeneralScore);
  });

  it("patches websiteAccessible/websiteCheckNote only when a website result is passed", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    const { id: companyId } = await upsertCompanyWithFounders(db, batch.id, sampleCompany);

    const triageScore = buildScoreResult(fullRawScore(), "triage", sampleThesis);
    await upsertScore(db, companyId, triageScore); // no website arg — triage never checks one

    let stored = await getCompanyBySlug(db, sampleCompany.slug);
    expect(stored?.websiteAccessible).toBeNull();

    const deepDiveScore = buildScoreResult(fullRawScore(), "deep_dive", sampleThesis);
    await upsertScore(db, companyId, deepDiveScore, { accessible: true });

    stored = await getCompanyBySlug(db, sampleCompany.slug);
    expect(stored?.websiteAccessible).toBe(true);
    expect(stored?.score?.pass).toBe("deep_dive");
  });

  it("overwrites rather than duplicates on repeated scoring of the same company", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    const { id: companyId } = await upsertCompanyWithFounders(db, batch.id, sampleCompany);

    await upsertScore(
      db,
      companyId,
      buildScoreResult(fullRawScore({ team: { founder_market_fit: 3 } }), "triage", sampleThesis)
    );
    await upsertScore(
      db,
      companyId,
      buildScoreResult(fullRawScore({ team: { founder_market_fit: 9 } }), "triage", sampleThesis)
    );

    const stored = await getCompanyBySlug(db, sampleCompany.slug);
    const breakdown = stored?.score?.rubricBreakdown as { team_general: { dimension: string; score: number }[] };
    const fitScore = breakdown.team_general.find((d) => d.dimension === "founder_market_fit")?.score;
    expect(fitScore).toBe(9);
  });
});

describe("rankCompaniesForDisplay", () => {
  it("ranks scored companies in one list by combined score (team + thesis), descending", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 3);

    const companyA: NormalizedCompany = { ...sampleCompany, slug: "company-a", name: "Company A" };
    const companyB: NormalizedCompany = { ...sampleCompany, slug: "company-b", name: "Company B" };
    const { id: idA } = await upsertCompanyWithFounders(db, batch.id, companyA);
    const { id: idB } = await upsertCompanyWithFounders(db, batch.id, companyB);

    const lowThesis = { sector_alignment: 2, business_model_fit: 2, research_alignment: 2, category_potential: 2 };
    await upsertScore(
      db,
      idA,
      buildScoreResult(fullRawScore({ team: { founder_market_fit: 7, founder_track_record: 7, team_completeness: 7, idea_quality: 7, execution_signal: 7 }, thesisScores: lowThesis }), "triage", sampleThesis)
    );
    await upsertScore(
      db,
      idB,
      buildScoreResult(fullRawScore({ team: { founder_market_fit: 9, founder_track_record: 9, team_completeness: 9, idea_quality: 9, execution_signal: 9 }, thesisScores: lowThesis }), "triage", sampleThesis)
    );

    const all = await listCompaniesInBatch(db, batch.id);
    const { ranked } = rankCompaniesForDisplay(all);

    expect(ranked.map((c) => c.name)).toEqual(["Company B", "Company A"]);
  });

  it("ranks by the sum of both axes, not just the stronger one — a company strong on both outranks one that's stronger on only one", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 2);

    // Balanced: 6+6=12 combined. Lopsided: 9+2=11 combined, even though its
    // single strongest axis (9) beats the balanced company's best axis (6).
    const balanced: NormalizedCompany = { ...sampleCompany, slug: "balanced", name: "Balanced" };
    const lopsided: NormalizedCompany = { ...sampleCompany, slug: "lopsided", name: "Lopsided" };
    const { id: idBalanced } = await upsertCompanyWithFounders(db, batch.id, balanced);
    const { id: idLopsided } = await upsertCompanyWithFounders(db, batch.id, lopsided);

    const mid = { founder_market_fit: 6, founder_track_record: 6, team_completeness: 6, idea_quality: 6, execution_signal: 6 };
    const midThesis = { sector_alignment: 6, business_model_fit: 6, research_alignment: 6, category_potential: 6 };
    await upsertScore(db, idBalanced, buildScoreResult(fullRawScore({ team: mid, thesisScores: midThesis }), "triage", sampleThesis));

    const high = { founder_market_fit: 9, founder_track_record: 9, team_completeness: 9, idea_quality: 9, execution_signal: 9 };
    const lowThesis = { sector_alignment: 2, business_model_fit: 2, research_alignment: 2, category_potential: 2 };
    await upsertScore(db, idLopsided, buildScoreResult(fullRawScore({ team: high, thesisScores: lowThesis }), "triage", sampleThesis));

    const all = await listCompaniesInBatch(db, batch.id);
    const { ranked } = rankCompaniesForDisplay(all);

    expect(ranked.map((c) => c.name)).toEqual(["Balanced", "Lopsided"]);
  });

  it("puts companies with no score at all into unranked rather than throwing", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    await upsertCompanyWithFounders(db, batch.id, sampleCompany);
    const all = await listCompaniesInBatch(db, batch.id);
    const { unranked } = rankCompaniesForDisplay(all);
    expect(unranked).toHaveLength(1);
  });

  it("never puts a scored company in unranked — every real score gets ranked", async () => {
    const db = createFakeDb();
    const batch = await upsertBatch(db, "Summer 2026", 1);
    const { id } = await upsertCompanyWithFounders(db, batch.id, sampleCompany);
    await upsertScore(db, id, buildScoreResult(fullRawScore(), "triage", sampleThesis));
    const all = await listCompaniesInBatch(db, batch.id);
    const { ranked, unranked } = rankCompaniesForDisplay(all);
    expect(ranked).toHaveLength(1);
    expect(unranked).toHaveLength(0);
  });
});

describe("listAllCompaniesWithRelations", () => {
  it("returns companies across every batch, not just one", async () => {
    const db = createFakeDb();
    const batchA = await upsertBatch(db, "Summer 2026", 1);
    const batchB = await upsertBatch(db, "Winter 2026", 1);
    await upsertCompanyWithFounders(db, batchA.id, { ...sampleCompany, slug: "company-a", name: "Company A" });
    await upsertCompanyWithFounders(db, batchB.id, { ...sampleCompany, slug: "company-b", name: "Company B" });

    const all = await listAllCompaniesWithRelations(db);

    expect(all.map((c) => c.name).sort()).toEqual(["Company A", "Company B"]);
  });

  it("returns an empty array rather than throwing when nothing has been ingested yet", async () => {
    const db = createFakeDb();
    const all = await listAllCompaniesWithRelations(db);
    expect(all).toEqual([]);
  });
});
