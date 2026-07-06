import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../fixtures/fakeDb";
import { sampleCompany, sampleThesis, fullRawScore } from "../fixtures/testData";
import { upsertBatch, upsertCompanyWithFounders, upsertScore } from "../../src/lib/db/repository";
import { buildScoreResult } from "../../src/lib/scoring/scoreTool";

const db = createFakeDb();
vi.mock("../../src/lib/db/client", () => ({ getDb: () => db }));

const { GET } = await import("../../src/app/api/companies/[slug]/route");

function paramsFor(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/companies/[slug]", () => {
  it("returns full detail including founders and the rubric breakdown", async () => {
    const batch = await upsertBatch(db, "Summer 2026", 1);
    const { id } = await upsertCompanyWithFounders(db, batch.id, sampleCompany);
    await upsertScore(db, id, buildScoreResult(fullRawScore(), "deep_dive", sampleThesis));

    const response = await GET(new Request("http://localhost/api/companies/florin"), paramsFor("florin"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.name).toBe("Florin");
    expect(body.founders[0].name).toBe("Shaurya Aggarwal");
    expect(body.rubricBreakdown.team_general).toBeDefined();
    expect(body.pass).toBe("deep_dive");
  });

  it("returns 404 for an unknown slug", async () => {
    const response = await GET(new Request("http://localhost/api/companies/nope"), paramsFor("nope"));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatch(/No company found/);
  });

  it("returns null rubric fields, not an error, for a company that hasn't been scored yet", async () => {
    const batch = await upsertBatch(db, "Summer 2026", 1);
    await upsertCompanyWithFounders(db, batch.id, { ...sampleCompany, slug: "unscored-co", name: "Unscored Co" });

    const response = await GET(new Request("http://localhost/api/companies/unscored-co"), paramsFor("unscored-co"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rubricBreakdown).toBeNull();
    expect(body.primaryCategory).toBeNull();
  });
});
