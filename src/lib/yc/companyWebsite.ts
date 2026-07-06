import { fetchTextOrNull, stripHtmlBoilerplate } from "../http";

export interface WebsiteFetchResult {
  accessible: boolean;
  /** Cleaned, truncated text if accessible; undefined otherwise. */
  content?: string;
  /** Human-readable reason, set whenever accessible is false. */
  note?: string;
}

/**
 * Fetch a company's own website for the deep-dive scoring pass.
 *
 * External company sites are far more variable than YC's own
 * infrastructure — some are slow, some are single-page apps that render
 * nothing without JS, some don't resolve at all for a two-person pre-seed
 * team that hasn't renewed a domain. None of that should block scoring:
 * per the product requirement, an unreachable site means "score from the
 * YC page alone and note it," not "skip the company" or "fail the batch."
 *
 * Shorter default timeout than the YC page fetch (8s vs 10s) — external
 * sites are enough more likely to hang that it's not worth waiting as long
 * per company when a batch might have hundreds to get through.
 */
export async function fetchCompanyWebsite(url: string, timeoutMs = 8_000): Promise<WebsiteFetchResult> {
  const html = await fetchTextOrNull(url, { timeoutMs });
  if (html === null) {
    return { accessible: false, note: `Company website (${url}) did not respond within ${timeoutMs / 1000}s.` };
  }
  const cleaned = stripHtmlBoilerplate(html).slice(0, 15_000);
  if (cleaned.trim().length < 50) {
    // Technically "reachable" but effectively empty — most often a JS-only
    // SPA shell we can't render, or a genuinely blank placeholder site.
    // Treat it the same as unreachable for scoring purposes: there's no
    // real evidence here either way, and the rationale should say so
    // rather than scoring off a near-empty string as if it were content.
    return {
      accessible: false,
      note: `Company website (${url}) returned a response but almost no readable content — likely a JavaScript-only page we can't render, or a placeholder.`,
    };
  }
  return { accessible: true, content: cleaned };
}
