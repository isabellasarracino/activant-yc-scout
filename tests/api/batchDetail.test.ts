import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../fixtures/fakeDb";
import { sampleCompany, sampleThesis, fullRawScore } from "../fixtures/testData";
import { upsertBatch, upsertCompanyWithFounders, upsertScore } from "../../src/lib/db/repository";
import { buildScoreResult } from "../../src/lib/scoring/scoreTool";

const db = createFakeDb();
vi.mock("../../src/lib/db/client", () => ({ getDb: () => db }));

const { GET } = await import("../../src/app/api/batches/[batch]/route");

function paramsFor(batch: string) {
  return { params: Promise.resolve({ batch }) };
}

describe("GET /api/batches/[batch]", () => {
  it("returns companies in one ranked list, each still carrying its own category badge fields", async () => {
    const batch = await upsertBatch(db, "Summer 2026", 2);

    const teamCo = { ...sampleCompany, slug: "team-co", name: "Team Co" };
    const { id: teamId } = await upsertCompanyWithFounders(db, batch.id, teamCo);
    await upsertScore(
      db,
      teamId,
      buildScoreResult(
        fullRawScore({
          team: { founder_market_fit: 9, founder_track_record: 9, team_completeness: 9, idea_quality: 9, execution_signal: 9 },
          thesisScores: { sector_alignment: 2, business_model_fit: 2, research_alignment: 2, category_potential: 2 },
        }),
        "triage",
        sampleThesis
      )
    );

    const response = await GET(new Request("http://localhost/api/batches/summer-2026"), paramsFor(batch.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ranked.map((c: { slug: string }) => c.slug)).toEqual(["team-co"]);
    expect(body.ranked[0].primaryCategory).toBe("team_general");
  });

  it("returns 404 for an unknown batch id", async () => {
    const response = await GET(new Request("http://localhost/api/batches/nope"), paramsFor("nope"));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatch(/No batch found/);
  });

  it("returns compact fields only — no rubric breakdown at this level", async () => {
    const batch = await upsertBatch(db, "Fall 2026", 1);
    const co = { ...sampleCompany, slug: "compact-check", name: "Compact Check" };
    const { id } = await upsertCompanyWithFounders(db, batch.id, co);
    await upsertScore(db, id, buildScoreResult(fullRawScore(), "triage", sampleThesis));

    const response = await GET(new Request("http://localhost/api/batches/fall-2026"), paramsFor(batch.id));
    const body = await response.json();
    const all = [...body.ranked, ...body.unranked];
    const found = all.find((c: { slug: string }) => c.slug === "compact-check");
    expect(found.rubricBreakdown).toBeUndefined();
    expect(found.founders).toBeUndefined();
  });

  it("puts a not-yet-scored company in unranked, not in the ranked list", async () => {
    const batch = await upsertBatch(db, "Winter 2027", 1);
    await upsertCompanyWithFounders(db, batch.id, { ...sampleCompany, slug: "pending-co", name: "Pending Co" });

    const response = await GET(new Request("http://localhost/api/batches/winter-2027"), paramsFor(batch.id));
    const body = await response.json();

    expect(body.ranked).toEqual([]);
    expect(body.unranked.map((c: { slug: string }) => c.slug)).toEqual(["pending-co"]);
  });
});
