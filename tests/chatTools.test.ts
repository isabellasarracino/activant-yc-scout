import { describe, expect, it } from "vitest";
import { createFakeDb } from "./fixtures/fakeDb";
import { sampleCompany, sampleThesis, fullRawScore } from "./fixtures/testData";
import { upsertBatch, upsertCompanyWithFounders, upsertScore } from "../src/lib/db/repository";
import { buildScoreResult } from "../src/lib/scoring/scoreTool";
import { dispatchChatTool } from "../src/lib/chat/tools";

async function seedOneCompany() {
  const db = createFakeDb();
  const batch = await upsertBatch(db, "Summer 2026", 1);
  const { id } = await upsertCompanyWithFounders(db, batch.id, sampleCompany);
  await upsertScore(db, id, buildScoreResult(fullRawScore(), "triage", sampleThesis));
  return db;
}

describe("dispatchChatTool", () => {
  it("list_batches returns the seeded batch", async () => {
    const db = await seedOneCompany();
    const result = (await dispatchChatTool(db, "list_batches", {})) as Array<{ displayName: string }>;
    expect(result.map((b) => b.displayName)).toEqual(["Summer 2026"]);
  });

  it("search_companies finds the seeded company by name", async () => {
    const db = await seedOneCompany();
    const result = (await dispatchChatTool(db, "search_companies", { query: "florin" })) as Array<{ slug: string }>;
    expect(result.map((c) => c.slug)).toContain("florin");
  });

  it("search_companies maps batch_id (snake_case tool input) to batchId correctly", async () => {
    const db = await seedOneCompany();
    const result = (await dispatchChatTool(db, "search_companies", { query: "", batch_id: "summer-2026" })) as Array<{ slug: string }>;
    expect(result).toHaveLength(1);
    const wrongBatch = (await dispatchChatTool(db, "search_companies", { query: "", batch_id: "winter-2027" })) as Array<{ slug: string }>;
    expect(wrongBatch).toHaveLength(0);
  });

  it("list_top_companies returns the scored company", async () => {
    const db = await seedOneCompany();
    const result = (await dispatchChatTool(db, "list_top_companies", {})) as Array<{ slug: string }>;
    expect(result.map((c) => c.slug)).toContain("florin");
  });

  it("get_company returns full detail for a known slug", async () => {
    const db = await seedOneCompany();
    const result = (await dispatchChatTool(db, "get_company", { slug: "florin" })) as { name?: string };
    expect(result.name).toBe("Florin");
  });

  it("get_company returns a helpful error object (not a throw) for an unknown slug", async () => {
    const db = await seedOneCompany();
    const result = (await dispatchChatTool(db, "get_company", { slug: "nope" })) as { error?: string };
    expect(result.error).toMatch(/No company found/);
  });

  it("returns an error object rather than throwing for an unknown tool name", async () => {
    const db = await seedOneCompany();
    const result = (await dispatchChatTool(db, "delete_everything", {})) as { error?: string };
    expect(result.error).toMatch(/Unknown tool/);
  });
});
