/**
 * Fetch a URL's text content, returning null instead of throwing on any
 * failure — bad status, timeout, DNS error, TLS error, whatever. Used
 * anywhere the product requirement is "degrade gracefully and note it,
 * never block on one unreachable page." See fetchCompanyPageHtml (Phase 1)
 * and fetchCompanyWebsite (Phase 2b) for the two call sites.
 */
export async function fetchTextOrNull(
  url: string,
  opts: { timeoutMs?: number; userAgent?: string } = {}
): Promise<string | null> {
  const { timeoutMs = 10_000, userAgent = "ActivantYCScout/0.1 (internal research tool)" } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": userAgent } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strips script/style/svg/comment noise from raw HTML before it goes into
 * a prompt. Not a security sanitizer and not meant to be one — purely a
 * token-spend reduction, since none of that content is ever relevant to
 * what we're extracting.
 */
export function stripHtmlBoilerplate(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}
