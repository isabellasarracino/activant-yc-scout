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
 * The first batch this project ever tracked, and the cutoff for "which
 * batches show up in the dropdown at all" (see `findBatchesFrom` below).
 * Deliberately not the full "every YC batch since 2022" scope — that was
 * discussed with the user as a much bigger feature (full historical
 * backfill) and explicitly deferred; this is the narrower "current and
 * future batches" scope they actually asked for.
 */
export const EARLIEST_TRACKED_BATCH = "Summer 2026";

const SEASON_RANK: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };

/**
 * Parses "<Season> <Year>" out of a YC batch display name into a
 * lexicographically-comparable [year, season] pair. Shared by
 * `findLatestBatch` and `findBatchesFrom` so there's exactly one
 * definition of "what chronological order means" for batch names.
 * Falls back to `[0, 0]` (earliest possible) for anything unparseable,
 * so a genuinely unexpected name can't accidentally sort as newest.
 */
function chronologyKeyFromName(displayName: string): [number, number] {
  const match = displayName.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!match) return [0, 0];
  const [, season, year] = match;
  return [Number(year), SEASON_RANK[season!.toLowerCase()] ?? 0];
}

function isAtOrAfter(key: [number, number], cutoff: [number, number]): boolean {
  return key[0] > cutoff[0] || (key[0] === cutoff[0] && key[1] >= cutoff[1]);
}

/**
 * Picks the chronologically newest batch from a `listBatches()` result.
 * Doesn't trust object/array order (the mirror's JSON key order isn't a
 * documented guarantee).
 */
export function findLatestBatch(batches: BatchMeta[]): BatchMeta | null {
  let latest: BatchMeta | null = null;
  let latestKey: [number, number] = [0, 0];
  for (const b of batches) {
    const key = chronologyKeyFromName(b.displayName);
    if (!latest || key[0] > latestKey[0] || (key[0] === latestKey[0] && key[1] > latestKey[1])) {
      latest = b;
      latestKey = key;
    }
  }
  return latest;
}

/**
 * Every batch from `cutoffDisplayName` onward (inclusive), newest first —
 * the generalization of `findLatestBatch` for showing a whole run of
 * current-and-future batches in the dashboard's dropdown, not just the
 * single newest one. See `EARLIEST_TRACKED_BATCH` for why "Summer 2026
 * onward" specifically, and not further back.
 */
export function findBatchesFrom(batches: BatchMeta[], cutoffDisplayName: string): BatchMeta[] {
  const cutoffKey = chronologyKeyFromName(cutoffDisplayName);
  return batches
    .map((b) => ({ b, key: chronologyKeyFromName(b.displayName) }))
    .filter(({ key }) => isAtOrAfter(key, cutoffKey))
    .sort((x, y) => y.key[0] - x.key[0] || y.key[1] - x.key[1])
    .map(({ b }) => b);
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
