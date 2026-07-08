/**
 * Plain, JSON-safe shapes for the REST API — mainly turning `Date` into an
 * ISO string and picking which fields the compact vs. full view exposes.
 * Kept separate from `src/lib/chat/queryTools.ts`'s DTOs even though the
 * shapes overlap a lot: these two call sites (a frontend list view vs. a
 * tool result Claude reads) are free to diverge as each evolves, rather
 * than being coupled through one shared type that has to serve both.
 */
import type { CompanyWithRelations, BatchRow } from "../db/types";
import type { DimensionScore } from "../scoring/types";

export interface BatchDTO {
  id: string;
  displayName: string;
  companyCount: number | null;
  firstSyncedAt: string;
  lastSyncedAt: string;
}

export function serializeBatch(b: BatchRow): BatchDTO {
  return {
    id: b.id,
    displayName: b.displayName,
    companyCount: b.companyCount,
    firstSyncedAt: b.firstSyncedAt.toISOString(),
    lastSyncedAt: b.lastSyncedAt.toISOString(),
  };
}

/**
 * The "compact by default" card shape for a batch listing — enough to
 * render the rubric card collapsed (name, one-liner, both composite
 * scores, category) without shipping every rationale for every company
 * in a 150-300 company batch. Expand-on-click fetches the full shape from
 * GET /api/companies/[slug] instead of paying for it upfront.
 */
export interface CompanyCompactDTO {
  slug: string;
  name: string;
  oneLiner: string;
  website: string | null;
  teamSize: number | null;
  industries: string[];
  tags: string[];
  status: string;
  batchId: string;
  primaryCategory: "team_general" | "thesis_fit" | null;
  secondaryTag: boolean;
  /** Normalized single-label vertical extracted by the model (e.g. "Fintech"), null until scored. Powers the dashboard's sort-by-vertical control. */
  primaryVertical: string | null;
  teamGeneralScore: number | null;
  thesisAlignScore: number | null;
  pass: "triage" | "deep_dive" | null;
  summary: string | null;
}

export function serializeCompanyCompact(c: CompanyWithRelations): CompanyCompactDTO {
  return {
    slug: c.slug,
    name: c.name,
    oneLiner: c.oneLiner,
    website: c.website,
    teamSize: c.teamSize,
    industries: c.industries,
    tags: c.tags,
    status: c.status,
    batchId: c.batchId,
    primaryCategory: c.score?.primaryCategory ?? null,
    secondaryTag: c.score?.secondaryTag ?? false,
    primaryVertical: c.score?.primaryVertical ?? null,
    teamGeneralScore: c.score?.teamGeneralScore ?? null,
    thesisAlignScore: c.score?.thesisAlignScore ?? null,
    pass: c.score?.pass ?? null,
    summary: c.score?.summary ?? null,
  };
}

/** Mirrors ScoreResult.rubricBreakdown's real shape (src/lib/scoring/types.ts) — given a real type here rather than `unknown` so frontend components (Phase 4) don't need a blind cast to render it. */
export interface RubricBreakdownDTO {
  team_general: DimensionScore[];
  thesis_fit: DimensionScore[];
}

/** The "click to expand" full detail: everything compact has, plus founders and the full per-dimension rubric breakdown. */
export interface CompanyFullDTO extends CompanyCompactDTO {
  longDescription: string;
  ycUrl: string;
  websiteAccessible: boolean | null;
  websiteCheckNote: string | null;
  regions: string[];
  launchedAt: string | null;
  founderExtractionNote: string | null;
  founders: Array<{
    name: string;
    title: string | null;
    bio: string | null;
    linkedinUrl: string | null;
    twitterUrl: string | null;
  }>;
  rubricBreakdown: RubricBreakdownDTO | null;
  scoredAt: string | null;
}

export function serializeCompanyFull(c: CompanyWithRelations): CompanyFullDTO {
  return {
    ...serializeCompanyCompact(c),
    longDescription: c.longDescription,
    ycUrl: c.ycUrl,
    websiteAccessible: c.websiteAccessible,
    websiteCheckNote: c.websiteCheckNote,
    regions: c.regions,
    launchedAt: c.launchedAt ? c.launchedAt.toISOString() : null,
    founderExtractionNote: c.founderExtractionNote,
    founders: c.founders.map((f) => ({
      name: f.name,
      title: f.title,
      bio: f.bio,
      linkedinUrl: f.linkedinUrl,
      twitterUrl: f.twitterUrl,
    })),
    rubricBreakdown: (c.score?.rubricBreakdown as RubricBreakdownDTO | undefined) ?? null,
    scoredAt: c.score?.scoredAt ? c.score.scoredAt.toISOString() : null,
  };
}
