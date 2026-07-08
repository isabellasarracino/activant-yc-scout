import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "../fixtures/fakeDb";
import { upsertBatch } from "../../src/lib/db/repository";

const db = createFakeDb();
vi.mock("../../src/lib/db/client", () => ({ getDb: () => db }));

const mockListBatches = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/yc/mirror", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/yc/mirror")>("../../src/lib/yc/mirror");
  return { ...actual, listBatches: mockListBatches };
});

const { GET } = await import("../../src/app/api/yc/batches/route");

const ycBatches = [
  { slug: "winter-2026", displayName: "Winter 2026", count: 40 }, // before the cutoff, excluded
  { slug: "summer-2026", displayName: "Summer 2026", count: 62 },
  { slug: "fall-2026", displayName: "Fall 2026", count: 4 },
];

describe("GET /api/yc/batches", () => {
  beforeEach(() => {
    mockListBatches.mockReset();
  });

  it("returns only batches from Summer 2026 onward, newest first", async () => {
    mockListBatches.mockResolvedValueOnce(ycBatches);
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.batches.map((b: { displayName: string }) => b.displayName)).toEqual(["Fall 2026", "Summer 2026"]);
  });

  it("flags a batch we've never evaluated with alreadyEvaluated: false and hasNewCompanies: true", async () => {
    mockListBatches.mockResolvedValueOnce(ycBatches);
    const response = await GET();
    const body = await response.json();

    const fall = body.batches.find((b: { slug: string }) => b.slug === "fall-2026");
    expect(fall).toMatchObject({ ourCompanyCount: 0, alreadyEvaluated: false, hasNewCompanies: true, mirrorCompanyCount: 4 });
  });

  it("flags a fully up-to-date batch with hasNewCompanies: false", async () => {
    mockListBatches.mockResolvedValueOnce(ycBatches);
    await upsertBatch(db, "Summer 2026", 62); // matches the mirror's current count exactly

    const response = await GET();
    const body = await response.json();

    const summer = body.batches.find((b: { slug: string }) => b.slug === "summer-2026");
    expect(summer).toMatchObject({ ourCompanyCount: 62, alreadyEvaluated: true, hasNewCompanies: false });
  });

  it("flags a grown batch with hasNewCompanies: true even though it's already been evaluated once", async () => {
    mockListBatches.mockResolvedValueOnce([{ slug: "summer-2026", displayName: "Summer 2026", count: 70 }]);
    // db already has Summer 2026 at 62 from the previous test in this file (shared fake db)

    const response = await GET();
    const body = await response.json();

    const summer = body.batches.find((b: { slug: string }) => b.slug === "summer-2026");
    expect(summer).toMatchObject({ ourCompanyCount: 62, mirrorCompanyCount: 70, alreadyEvaluated: true, hasNewCompanies: true });
  });

  it("returns 500 with a clear message if the mirror can't be reached", async () => {
    mockListBatches.mockRejectedValueOnce(new Error("yc-oss meta.json fetch failed: HTTP 503"));
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/503/);
  });
});
