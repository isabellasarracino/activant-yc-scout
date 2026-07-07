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

const { GET } = await import("../../src/app/api/yc/latest-batch/route");

const ycBatches = [
  { slug: "summer-2026", displayName: "Summer 2026", count: 54 },
  { slug: "fall-2026", displayName: "Fall 2026", count: 4 },
];

describe("GET /api/yc/latest-batch", () => {
  beforeEach(() => {
    mockListBatches.mockReset();
  });

  it("returns the chronologically newest batch from the mirror, flagged as not yet evaluated", async () => {
    mockListBatches.mockResolvedValueOnce(ycBatches);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ slug: "fall-2026", displayName: "Fall 2026", companyCount: 4, alreadyEvaluated: false });
  });

  it("flags alreadyEvaluated: true once we've actually ingested that batch", async () => {
    mockListBatches.mockResolvedValueOnce(ycBatches);
    await upsertBatch(db, "Fall 2026", 4);

    const response = await GET();
    const body = await response.json();

    expect(body.alreadyEvaluated).toBe(true);
  });

  it("returns 500 with a clear message if the mirror can't be reached", async () => {
    mockListBatches.mockRejectedValueOnce(new Error("yc-oss meta.json fetch failed: HTTP 503"));
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/503/);
  });
});
