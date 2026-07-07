import { callForcedTool, MODELS, type ToolDef } from "../ai/openrouter";
import { fetchTextOrNull, stripHtmlBoilerplate } from "../http";
import type { Founder } from "./types";

const FOUNDER_EXTRACTION_TOOL: ToolDef = {
  name: "record_founders",
  description: "Record the founders listed on a YC company profile page.",
  input_schema: {
    type: "object",
    properties: {
      founders: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            title: { type: "string", description: "e.g. 'Founder & CEO'" },
            bio: { type: "string", description: "Their background paragraph, as close to verbatim as possible." },
            linkedinUrl: { type: "string" },
            twitterUrl: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
    required: ["founders"],
  },
};

/**
 * Fetch a YC company's own profile page (e.g. ycombinator.com/companies/florin).
 *
 * Returns null instead of throwing on any failure (bad status, timeout,
 * network error) — per the product requirement, a slow or broken company
 * page should degrade to "score from YC batch data only, with a note",
 * never block or fail the rest of the batch.
 */
export async function fetchCompanyPageHtml(ycUrl: string, timeoutMs = 10_000): Promise<string | null> {
  return fetchTextOrNull(ycUrl, { timeoutMs });
}

/**
 * Extract founder name/title/bio/social links from a fetched YC company
 * page.
 *
 * We deliberately do NOT hand-write CSS selectors for this. We don't have
 * ground truth on YC's DOM/class names (only rendered content), and even
 * if we did, a markup change on YC's end would silently break a selector
 * with no error — whereas asking Claude to structure the visible content
 * degrades gracefully (worst case: it returns fewer founders, not a
 * runtime exception) and keeps working across redesigns.
 * See docs/ARCHITECTURE.md#founder-extraction.
 */
export async function extractFoundersFromHtml(html: string): Promise<Founder[]> {
  const trimmed = stripHtmlBoilerplate(html).slice(0, 20_000);

  try {
    const { input } = await callForcedTool({
      model: MODELS.extraction,
      maxTokens: 1500,
      userContent:
        "Here is the rendered content of a Y Combinator company profile page. " +
        'Extract every founder listed under "Founders" / "Active Founders", with ' +
        "their name, title, full bio text, and any LinkedIn/Twitter URL shown next " +
        "to their name. If no founders section is present, return an empty array. " +
        "Do not invent anyone or infer a bio that isn't on the page.\n\n" +
        trimmed,
      tool: FOUNDER_EXTRACTION_TOOL,
    });
    const parsed = input as { founders?: Founder[] };
    return parsed.founders ?? [];
  } catch {
    // No tool call at all (e.g. the model responded with plain text
    // instead) degrades to "no founders extracted," same as the rest of
    // this file's graceful-degradation philosophy — never blocks the batch.
    return [];
  }
}
