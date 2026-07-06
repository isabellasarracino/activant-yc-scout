import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../fixtures/fakeDb";
import { upsertBatch } from "../../src/lib/db/repository";

const db = createFakeDb();
vi.mock("../../src/lib/db/client", () => ({ getDb: () => db }));

const { GET } = await import("../../src/app/api/batches/route");

describe("GET /api/batches", () => {
  it("returns every ingested batch as JSON", async () => {
    await upsertBatch(db, "Summer 2026", 54);
    await upsertBatch(db, "Winter 2027", 10);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.batches.map((b: { displayName: string }) => b.displayName).sort()).toEqual(["Summer 2026", "Winter 2027"]);
  });

  it("serializes dates as ISO strings, not Date objects", async () => {
    const response = await GET();
    const body = await response.json();
    expect(typeof body.batches[0].lastSyncedAt).toBe("string");
    expect(() => new Date(body.batches[0].lastSyncedAt)).not.toThrow();
  });
});
