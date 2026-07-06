import Anthropic from "@anthropic-ai/sdk";
import { fetchTextOrNull, stripHtmlBoilerplate } from "../http";
import type { Founder } from "./types";

// Lazily constructed so importing this module doesn't require
// ANTHROPIC_API_KEY to be set (e.g. when running mirror-only tests).
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/** Small, fast model — this is a structuring task, not an evaluative one. */
const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

const FOUNDER_EXTRACTION_TOOL: Anthropic.Tool = {
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

  const msg = await client().messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 1500,
    tools: [FOUNDER_EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_founders" },
    messages: [
      {
        role: "user",
        content:
          "Here is the rendered content of a Y Combinator company profile page. " +
          'Extract every founder listed under "Founders" / "Active Founders", with ' +
          "their name, title, full bio text, and any LinkedIn/Twitter URL shown next " +
          "to their name. If no founders section is present, return an empty array. " +
          "Do not invent anyone or infer a bio that isn't on the page.\n\n" +
          trimmed,
      },
    ],
  });

  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUse) return [];
  const parsed = toolUse.input as { founders?: Founder[] };
  return parsed.founders ?? [];
}
