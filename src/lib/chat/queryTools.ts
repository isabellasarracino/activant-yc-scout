/**
 * The actual data-access behind the chat tools (`src/lib/chat/tools.ts`
 * wires these into Anthropic tool schemas + dispatch). Kept separate from
 * anything Anthropic-shaped so this file can be unit-tested directly
 * against `tests/fixtures/fakeDb.ts` — no mocked SDK client needed to
 * check "does search actually find the right company."
 *
 * Design choice worth naming: no embeddings/vector search. A batch is
 * 150-300 companies and there are only a handful of batches in play at
 * once, so an in-memory filter/sort over `listAllCompaniesWithRelations`
 * is fast enough, and it means Claude's own judgment (via tool choice and
 * how it phrases search queries) does the "understand vague phrasing"
 * work instead of a fixed intent-classifier or a vector index that would
 * need its own maintenance. Revisit if historical backfill ever pushes
 * the corpus into the tens of thousands of rows.
 */
import type { PrismaLike } from "../db/prismaLike";
import type { CompanyWithRelations } from "../db/types";
import { getCompanyBySlug, listAllCompaniesWithRelations, listBatchesFromDb } from "../db/repository";

export interface CompanySummary {
  slug: string;
  name: string;
  oneLiner: string;
  batchId: string;
  batch: string;
  primaryCategory: "team_general" | "thesis_fit" | null;
  secondaryTag: boolean;
  teamGeneralScore: number | null;
  thesisAlignScore: number | null;
  summary: string | null;
}

export interface CompanyDetail extends CompanySummary {
  longDescription: string;
  website: string | null;
  websiteAccessible: boolean | null;
  websiteCheckNote: string | null;
  teamSize: number | null;
  industries: string[];
  tags: string[];
  regions: string[];
  status: string;
  pass: "triage" | "deep_dive" | null;
  founders: Array<{ name: string; title: string | null; bio: string | null; linkedinUrl: string | null; twitterUrl: string | null }>;
  rubricBreakdown: unknown;
}

export interface BatchSummary {
  id: string;
  displayName: string;
  companyCount: number | null;
  lastSyncedAt: string;
}

/** Fetches once, reused across all rows in a call — avoids one query per company for a field that's the same for the whole batch. */
async function batchNameMap(db: PrismaLike): Promise<Map<string, string>> {
  const batches = await listBatchesFromDb(db);
  return new Map(batches.map((b) => [b.id, b.displayName]));
}

function toSummary(company: CompanyWithRelations, batchNames: Map<string, string>): CompanySummary {
  return {
    slug: company.slug,
    name: company.name,
    oneLiner: company.oneLiner,
    batchId: company.batchId,
    batch: batchNames.get(company.batchId) ?? company.batchId,
    primaryCategory: company.score?.primaryCategory ?? null,
    secondaryTag: company.score?.secondaryTag ?? false,
    teamGeneralScore: company.score?.teamGeneralScore ?? null,
    thesisAlignScore: company.score?.thesisAlignScore ?? null,
    summary: company.score?.summary ?? null,
  };
}

function toDetail(company: CompanyWithRelations, batchNames: Map<string, string>): CompanyDetail {
  return {
    ...toSummary(company, batchNames),
    longDescription: company.longDescription,
    website: company.website,
    websiteAccessible: company.websiteAccessible,
    websiteCheckNote: company.websiteCheckNote,
    teamSize: company.teamSize,
    industries: company.industries,
    tags: company.tags,
    regions: company.regions,
    status: company.status,
    pass: company.score?.pass ?? null,
    founders: company.founders.map((f) => ({
      name: f.name,
      title: f.title,
      bio: f.bio,
      linkedinUrl: f.linkedinUrl,
      twitterUrl: f.twitterUrl,
    })),
    rubricBreakdown: company.score?.rubricBreakdown ?? null,
  };
}

/** Used for search-result tie-breaking (see below) — "how notable is this company overall." */
function strengthOf(company: CompanyWithRelations): number {
  return Math.max(company.score?.teamGeneralScore ?? 0, company.score?.thesisAlignScore ?? 0);
}

/** Team + thesis combined — what "top companies" ranks by now, matching the dashboard's single ranked list (rankCompaniesForDisplay in src/lib/db/repository.ts). */
function combinedScoreOf(company: CompanyWithRelations): number {
  return (company.score?.teamGeneralScore ?? 0) + (company.score?.thesisAlignScore ?? 0);
}

export async function listBatchesSummary(db: PrismaLike): Promise<BatchSummary[]> {
  const batches = await listBatchesFromDb(db);
  return batches.map((b) => ({
    id: b.id,
    displayName: b.displayName,
    companyCount: b.companyCount,
    lastSyncedAt: b.lastSyncedAt.toISOString(),
  }));
}

export interface SearchCompaniesInput {
  query: string;
  batchId?: string;
  limit?: number;
}

/**
 * Case-insensitive substring match over name, one-liner, industries, and
 * tags. Matches on the company name are ranked first (a name hit is
 * almost always what "find X" means), then by score strength as a
 * tiebreak, so a vague query like "the payments one" still surfaces the
 * most notable match first among several partial hits.
 */
export async function searchCompanies(db: PrismaLike, input: SearchCompaniesInput): Promise<CompanySummary[]> {
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 50) : 15;
  const q = input.query.trim().toLowerCase();
  const batchNames = await batchNameMap(db);
  const all = await listAllCompaniesWithRelations(db);
  const scoped = input.batchId ? all.filter((c) => c.batchId === input.batchId) : all;

  if (!q) return scoped.slice(0, limit).map((c) => toSummary(c, batchNames));

  const matches = scoped
    .map((c) => {
      const nameHit = c.name.toLowerCase().includes(q);
      const otherHit =
        c.oneLiner.toLowerCase().includes(q) ||
        c.industries.some((i) => i.toLowerCase().includes(q)) ||
        c.tags.some((t) => t.toLowerCase().includes(q));
      return { company: c, nameHit, hit: nameHit || otherHit };
    })
    .filter((m) => m.hit)
    .sort((a, b) => {
      if (a.nameHit !== b.nameHit) return a.nameHit ? -1 : 1;
      return strengthOf(b.company) - strengthOf(a.company);
    });

  return matches.slice(0, limit).map((m) => toSummary(m.company, batchNames));
}

export interface ListTopCompaniesInput {
  /** Restrict to one category, or omit/"any" to rank by combined score (team + thesis) — matches the dashboard's single ranked list. */
  category?: "team_general" | "thesis_fit" | "any";
  batchId?: string;
  limit?: number;
}

export async function listTopCompanies(db: PrismaLike, input: ListTopCompaniesInput): Promise<CompanySummary[]> {
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 50) : 10;
  const category = input.category ?? "any";
  const batchNames = await batchNameMap(db);
  const all = await listAllCompaniesWithRelations(db);
  const scoped = input.batchId ? all.filter((c) => c.batchId === input.batchId) : all;

  const scored = scoped.filter((c) => c.score !== null);
  const filtered = category === "any" ? scored : scored.filter((c) => c.score?.primaryCategory === category);

  const rankValue = (c: CompanyWithRelations) =>
    category === "team_general"
      ? (c.score?.teamGeneralScore ?? 0)
      : category === "thesis_fit"
        ? (c.score?.thesisAlignScore ?? 0)
        : combinedScoreOf(c);

  const sorted = [...filtered].sort((a, b) => rankValue(b) - rankValue(a));
  return sorted.slice(0, limit).map((c) => toSummary(c, batchNames));
}

export async function getCompanyDetail(db: PrismaLike, slug: string): Promise<CompanyDetail | null> {
  const company = await getCompanyBySlug(db, slug);
  if (!company) return null;
  const batchNames = await batchNameMap(db);
  return toDetail(company, batchNames);
}
