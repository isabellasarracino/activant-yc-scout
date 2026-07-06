import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBatchFromMirror, listBatches, toBatchSlug } from "../src/lib/yc/mirror";

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
