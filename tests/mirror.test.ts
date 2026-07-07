import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBatchFromMirror, findLatestBatch, listBatches, toBatchSlug } from "../src/lib/yc/mirror";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf-8"));

describe("toBatchSlug", () => {
  it("lowercases and hyphenates a human batch name", () => {
    expect(toBatchSlug("Summer 2026")).toBe("summer-2026");
    expect(toBatchSlug("Fall 2025")).toBe("fall-2025");
    expect(toBatchSlug("  Winter 2026  ")).toBe("winter-2026");
  });
});

describe("listBatches", () => {
  it("flattens the mirror's batch index, real shape captured 2026-07-02", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => loadFixture("meta.sample.json") }))
    );
    const batches = await listBatches();
    expect(batches).toContainEqual({ slug: "summer-2026", displayName: "Summer 2026", count: 54 });
    expect(batches).toContainEqual({ slug: "fall-2026", displayName: "Fall 2026", count: 4 });
  });
});

describe("findLatestBatch", () => {
  it("picks the chronologically newest batch from the real mirror shape, not just the first/largest one", async () => {
    // Real data: "Fall 2026" has only 4 companies (a batch just starting
    // to be announced) while "Summer 2026" has 54 — proving this can't
    // just be picking the batch with the most companies.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => loadFixture("meta.sample.json") }))
    );
    const batches = await listBatches();
    const latest = findLatestBatch(batches);
    expect(latest).toEqual({ slug: "fall-2026", displayName: "Fall 2026", count: 4 });
  });

  it("orders Winter < Spring < Summer < Fall within the same year", () => {
    const batches = [
      { slug: "summer-2026", displayName: "Summer 2026", count: 10 },
      { slug: "winter-2026", displayName: "Winter 2026", count: 10 },
      { slug: "fall-2026", displayName: "Fall 2026", count: 10 },
      { slug: "spring-2026", displayName: "Spring 2026", count: 10 },
    ];
    expect(findLatestBatch(batches)?.displayName).toBe("Fall 2026");
  });

  it("prefers a later year over a later season in an earlier year", () => {
    const batches = [
      { slug: "fall-2025", displayName: "Fall 2025", count: 10 },
      { slug: "winter-2026", displayName: "Winter 2026", count: 10 },
    ];
    expect(findLatestBatch(batches)?.displayName).toBe("Winter 2026");
  });

  it("returns null for an empty list rather than throwing", () => {
    expect(findLatestBatch([])).toBeNull();
  });

  it("doesn't let an unparseable display name win by accident", () => {
    const batches = [
      { slug: "summer-2026", displayName: "Summer 2026", count: 10 },
      { slug: "mystery-batch", displayName: "Something Weird", count: 10 },
    ];
    expect(findLatestBatch(batches)?.displayName).toBe("Summer 2026");
  });
});

describe("fetchBatchFromMirror", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns the raw company array for a batch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => loadFixture("summer-2026.sample.json") }))
    );
    const companies = await fetchBatchFromMirror("summer-2026");
    expect(companies.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Baud", "RealPact", "Whitespace", "Florin", "Mireye", "Blueprints"])
    );
  });

  it("throws a descriptive error on a non-OK response rather than returning empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(fetchBatchFromMirror("not-a-real-batch")).rejects.toThrow(/404/);
  });
});
