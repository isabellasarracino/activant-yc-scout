import type { BatchMeta, YCMirrorCompany } from "./types";

const MIRROR_BASE = "https://yc-oss.github.io/api";

/**
 * Convert a human batch name to the slug the yc-oss mirror expects.
 * "Summer 2026" -> "summer-2026"
 */
export function toBatchSlug(displayName: string): string {
  return displayName.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * List every batch YC has run, with company counts, from the daily-refreshed
 * community mirror of YC's own Algolia index (see docs/DATA_SOURCES.md).
 * Useful both for backfilling history and for noticing when a brand new
 * batch slug (e.g. "fall-2026") first appears with a nonzero count.
 */
export async function listBatches(): Promise<BatchMeta[]> {
  const res = await fetch(`${MIRROR_BASE}/meta.json`);
  if (!res.ok) {
    throw new Error(`yc-oss meta.json fetch failed: HTTP ${res.status}`);
  }
  const meta = (await res.json()) as {
    batches: Record<string, { name: string; count: number }>;
  };
  return Object.entries(meta.batches).map(([slug, v]) => ({
    slug,
    displayName: v.name,
    count: v.count,
  }));
}

/**
 * Picks the chronologically newest batch from a `listBatches()` result.
 * Doesn't trust object/array order (the mirror's JSON key order isn't a
 * documented guarantee) — parses "<Season> <Year>" out of the display
 * name and compares year first, then season within a year. Falls back to
 * treating an unparseable name as earliest-possible, so a genuinely
 * unexpected name can't accidentally win by parsing to a huge value.
 */
export function findLatestBatch(batches: BatchMeta[]): BatchMeta | null {
  const seasonRank: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };

  function chronologyKey(b: BatchMeta): [number, number] {
    const match = b.displayName.match(/([A-Za-z]+)\s+(\d{4})/);
    if (!match) return [0, 0];
    const [, season, year] = match;
    return [Number(year), seasonRank[season!.toLowerCase()] ?? 0];
  }

  let latest: BatchMeta | null = null;
  let latestKey: [number, number] = [0, 0];
  for (const b of batches) {
    const key = chronologyKey(b);
    if (!latest || key[0] > latestKey[0] || (key[0] === latestKey[0] && key[1] > latestKey[1])) {
      latest = b;
      latestKey = key;
    }
  }
  return latest;
}

/**
 * Fetch every company recorded for a given batch slug (e.g. "summer-2026").
 * Throws on failure — the caller (ingestBatch) decides how to handle that,
 * since a failure here means we have no data at all for the batch, as
 * opposed to a single company's page being unreachable.
 */
export async function fetchBatchFromMirror(batchSlug: string): Promise<YCMirrorCompany[]> {
  const res = await fetch(`${MIRROR_BASE}/batches/${batchSlug}.json`);
  if (!res.ok) {
    throw new Error(`yc-oss batch fetch failed for "${batchSlug}": HTTP ${res.status}`);
  }
  return (await res.json()) as YCMirrorCompany[];
}
