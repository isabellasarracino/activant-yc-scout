import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCompanyWebsite } from "../src/lib/yc/companyWebsite";

describe("fetchCompanyWebsite", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns accessible: true with cleaned content on a normal page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => "<html><body><h1>Florin</h1><p>The financial OS for startups.</p></body></html>",
      }))
    );
    const result = await fetchCompanyWebsite("https://florin.inc");
    expect(result.accessible).toBe(true);
    expect(result.content).toContain("Florin");
    expect(result.note).toBeUndefined();
  });

  it("returns accessible: false with a note (not a throw) when the site doesn't respond", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("AbortError");
      })
    );
    const result = await fetchCompanyWebsite("https://slow-startup.example");
    expect(result.accessible).toBe(false);
    expect(result.content).toBeUndefined();
    expect(result.note).toMatch(/did not respond/);
  });

  it("returns accessible: false with a note on a non-OK HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const result = await fetchCompanyWebsite("https://gone-startup.example");
    expect(result.accessible).toBe(false);
    expect(result.note).toMatch(/did not respond/);
  });

  it("treats a near-empty response (e.g. an unrendered JS shell) as inaccessible rather than scoring off nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => '<html><body><div id="root"></div></body></html>' }))
    );
    const result = await fetchCompanyWebsite("https://spa-startup.example");
    expect(result.accessible).toBe(false);
    expect(result.note).toMatch(/almost no readable content/);
  });

  it("caps content length so a huge page doesn't blow up prompt size", async () => {
    const huge = `<html><body>${"<p>content</p>".repeat(5000)}</body></html>`;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => huge })));
    const result = await fetchCompanyWebsite("https://huge-startup.example");
    expect(result.accessible).toBe(true);
    expect(result.content!.length).toBeLessThanOrEqual(15_000);
  });
});
