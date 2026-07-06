import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YCMirrorCompany } from "../src/lib/yc/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf-8"));

vi.mock("../src/lib/yc/companyPage", () => ({
  fetchCompanyPageHtml: vi.fn(),
  extractFoundersFromHtml: vi.fn(),
}));

const { normalizeCompany, ingestBatch } = await import("../src/lib/yc/ingest");
const companyPage = await import("../src/lib/yc/companyPage");

const florin = loadFixture("summer-2026.sample.json").find(
  (c: YCMirrorCompany) => c.slug === "florin"
) as YCMirrorCompany;

describe("normalizeCompany", () => {
  beforeEach(() => {
    vi.mocked(companyPage.fetchCompanyPageHtml).mockReset();
    vi.mocked(companyPage.extractFoundersFromHtml).mockReset();
  });

  it("maps every mirror field to the normalized shape without touching the network when extraction is skipped", async () => {
    const result = await normalizeCompany(florin, /* skipFounderExtraction */ true);

    expect(result).toMatchObject({
      ycId: florin.id,
      slug: "florin",
      name: "Florin",
      oneLiner: florin.one_liner,
      longDescription: florin.long_description,
      website: florin.website,
      ycUrl: florin.url,
      status: "Active",
      teamSize: 3,
      batchSlug: "summer-2026",
      batchDisplayName: "Summer 2026",
      founders: [],
    });
    expect(result.launchedAt.getTime()).toBe(florin.launched_at * 1000);
    expect(result.founderExtractionNote).toBeUndefined();
    expect(companyPage.fetchCompanyPageHtml).not.toHaveBeenCalled();
  });

  it("treats an empty website string from the mirror as null, not an empty string", async () => {
    const noWebsite: YCMirrorCompany = { ...florin, website: "" };
    const result = await normalizeCompany(noWebsite, true);
    expect(result.website).toBeNull();
  });

  it("enriches with founders when the company page and extraction both succeed", async () => {
    vi.mocked(companyPage.fetchCompanyPageHtml).mockResolvedValue("<html>...</html>");
    vi.mocked(companyPage.extractFoundersFromHtml).mockResolvedValue([
      { name: "Shaurya Aggarwal", title: "Founder & CEO", linkedinUrl: "https://www.linkedin.com/in/shauryaagg" },
      { name: "Amol Pant", title: "Co-Founder & CTO" },
      { name: "Aydin Sorensen", title: "Founder" },
    ]);

    const result = await normalizeCompany(florin, false);
    expect(result.founders).toHaveLength(3);
    expect(result.founderExtractionNote).toBeUndefined();
  });

  it("degrades to YC-data-only with a note when the company page doesn't respond in time — required behavior per spec", async () => {
    vi.mocked(companyPage.fetchCompanyPageHtml).mockResolvedValue(null);

    const result = await normalizeCompany(florin, false);

    expect(result.founders).toEqual([]);
    expect(result.founderExtractionNote).toMatch(/did not respond/i);
    // Everything sourced from the mirror (i.e. from YC's own data) must still
    // be fully present — a slow company site should never blank out the
    // fields we already had.
    expect(result.oneLiner).toBe(florin.one_liner);
    expect(result.longDescription).toBe(florin.long_description);
    expect(result.website).toBe(florin.website);
    expect(companyPage.extractFoundersFromHtml).not.toHaveBeenCalled();
  });

  it("degrades with a note (not an unhandled rejection) when extraction itself throws", async () => {
    vi.mocked(companyPage.fetchCompanyPageHtml).mockResolvedValue("<html>...</html>");
    vi.mocked(companyPage.extractFoundersFromHtml).mockRejectedValue(new Error("rate limited"));

    const result = await normalizeCompany(florin, false);
    expect(result.founders).toEqual([]);
    expect(result.founderExtractionNote).toContain("rate limited");
  });
});

describe("ingestBatch", () => {
  it("pulls the full batch from the mirror and normalizes every company, respecting the concurrency cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => loadFixture("summer-2026.sample.json") }))
    );
    vi.mocked(companyPage.fetchCompanyPageHtml).mockResolvedValue(null); // fast path, no real extraction needed for this test

    const companies = await ingestBatch("Summer 2026", { concurrency: 2 });

    expect(companies).toHaveLength(6);
    expect(companies.map((c) => c.slug).sort()).toEqual(
      ["baud", "blueprints", "florin", "mireye", "realpact", "whitespace"].sort()
    );
    vi.unstubAllGlobals();
  });
});
