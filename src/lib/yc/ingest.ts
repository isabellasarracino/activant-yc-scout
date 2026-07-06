import { fetchBatchFromMirror, toBatchSlug } from "./mirror";
import { extractFoundersFromHtml, fetchCompanyPageHtml } from "./companyPage";
import type { NormalizedCompany, YCMirrorCompany } from "./types";

export interface IngestOptions {
  /** Cap concurrent per-company page fetches so we're a polite citizen of ycombinator.com. */
  concurrency?: number;
  /** Skip founder-page fetch/extraction entirely — fast path for a triage-only pass. */
  skipFounderExtraction?: boolean;
}

/**
 * Pull every company in a batch, normalized and (unless skipped) enriched
 * with founder bios pulled from each company's own YC profile page.
 *
 * A network failure fetching the bulk batch list is fatal (we have nothing
 * to work with) and throws. A failure fetching or parsing *one company's*
 * profile page is not fatal — it's caught, recorded on that company's
 * `founderExtractionNote`, and ingestion continues. A batch of 200
 * companies should never fail because of one flaky page.
 */
export async function ingestBatch(
  batchDisplayName: string,
  opts: IngestOptions = {}
): Promise<NormalizedCompany[]> {
  const { concurrency = 5, skipFounderExtraction = false } = opts;
  const slug = toBatchSlug(batchDisplayName);
  const raw = await fetchBatchFromMirror(slug);

  const results: NormalizedCompany[] = [];
  for (let i = 0; i < raw.length; i += concurrency) {
    const chunk = raw.slice(i, i + concurrency);
    const normalizedChunk = await Promise.all(
      chunk.map((c) => normalizeCompany(c, skipFounderExtraction))
    );
    results.push(...normalizedChunk);
  }
  return results;
}

export async function normalizeCompany(
  c: YCMirrorCompany,
  skipFounderExtraction: boolean
): Promise<NormalizedCompany> {
  const base: NormalizedCompany = {
    ycId: c.id,
    slug: c.slug,
    name: c.name,
    oneLiner: c.one_liner,
    longDescription: c.long_description,
    website: c.website || null,
    ycUrl: c.url,
    status: c.status,
    teamSize: c.team_size,
    industries: c.industries,
    tags: c.tags,
    regions: c.regions,
    launchedAt: new Date(c.launched_at * 1000),
    batchSlug: toBatchSlug(c.batch),
    batchDisplayName: c.batch,
    founders: [],
  };

  if (skipFounderExtraction) return base;

  const html = await fetchCompanyPageHtml(c.url);
  if (!html) {
    return {
      ...base,
      founderExtractionNote: "YC profile page did not respond in time; founders not extracted for this pass.",
    };
  }

  try {
    base.founders = await extractFoundersFromHtml(html);
  } catch (err) {
    base.founderExtractionNote = `Founder extraction failed: ${(err as Error).message}`;
  }
  return base;
}
