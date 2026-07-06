import type { PrismaLike } from "./prismaLike";
import type { CompanyWithRelations, BatchRow } from "./types";
import type { NormalizedCompany } from "../yc/types";
import type { ScoreResult } from "../scoring/types";
import { toBatchSlug } from "../yc/mirror";

/** Creates or refreshes a batch row's metadata and sync timestamp. */
export async function upsertBatch(db: PrismaLike, displayName: string, companyCount: number): Promise<BatchRow> {
  const slug = toBatchSlug(displayName);
  return db.batch.upsert({
    where: { id: slug },
    create: { id: slug, displayName, companyCount },
    update: { displayName, companyCount, lastSyncedAt: new Date() },
  });
}

export async function listBatchesFromDb(db: PrismaLike): Promise<BatchRow[]> {
  return db.batch.findMany({ orderBy: { lastSyncedAt: "desc" } });
}

/**
 * Writes a company and replaces its founders in one transaction.
 *
 * Founders are deleted and recreated rather than diffed/updated in place —
 * re-ingesting a company is infrequent (once per batch-check, not once per
 * chat question) and a founder list rarely changes shape in a way worth
 * diffing; delete+recreate is simpler and can't drift into a half-updated
 * state. If founder history/audit trail ever matters, revisit this.
 */
export async function upsertCompanyWithFounders(
  db: PrismaLike,
  batchId: string,
  company: NormalizedCompany
): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const row = await tx.company.upsert({
      where: { slug: company.slug },
      create: {
        ycId: company.ycId,
        slug: company.slug,
        name: company.name,
        oneLiner: company.oneLiner,
        longDescription: company.longDescription,
        website: company.website,
        websiteAccessible: null,
        websiteCheckNote: null,
        ycUrl: company.ycUrl,
        status: company.status,
        teamSize: company.teamSize,
        industries: company.industries,
        tags: company.tags,
        regions: company.regions,
        launchedAt: company.launchedAt,
        founderExtractionNote: company.founderExtractionNote ?? null,
        batchId,
      },
      update: {
        name: company.name,
        oneLiner: company.oneLiner,
        longDescription: company.longDescription,
        website: company.website,
        ycUrl: company.ycUrl,
        status: company.status,
        teamSize: company.teamSize,
        industries: company.industries,
        tags: company.tags,
        regions: company.regions,
        launchedAt: company.launchedAt,
        founderExtractionNote: company.founderExtractionNote ?? null,
      },
    });

    await tx.founder.deleteMany({ where: { companyId: row.id } });
    if (company.founders.length > 0) {
      await tx.founder.createMany({
        data: company.founders.map((f) => ({
          companyId: row.id,
          name: f.name,
          title: f.title ?? null,
          bio: f.bio ?? null,
          linkedinUrl: f.linkedinUrl ?? null,
          twitterUrl: f.twitterUrl ?? null,
          extraResearch: null,
        })),
      });
    }

    return { id: row.id };
  });
}

/**
 * Writes a score for an already-persisted company. If `website` is
 * provided (only the deep-dive pass checks a website), the company row's
 * `websiteAccessible`/`websiteCheckNote` fields are patched in the same
 * transaction — triage-only calls omit `website` entirely so they never
 * overwrite a real deep-dive website result with "not checked."
 */
export async function upsertScore(
  db: PrismaLike,
  companyId: string,
  score: ScoreResult,
  website?: { accessible: boolean; note?: string }
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.companyScore.upsert({
      where: { companyId },
      create: {
        companyId,
        pass: score.pass,
        teamGeneralScore: score.teamGeneralScore,
        thesisAlignScore: score.thesisAlignScore,
        primaryCategory: score.primaryCategory,
        secondaryTag: score.secondaryTag,
        rubricBreakdown: score.rubricBreakdown as unknown,
        summary: score.summary,
        thesisVersionId: null, // wired up once ThesisVersion rows are persisted — see docs/ARCHITECTURE.md#storage
        scoredAt: new Date(),
      },
      update: {
        pass: score.pass,
        teamGeneralScore: score.teamGeneralScore,
        thesisAlignScore: score.thesisAlignScore,
        primaryCategory: score.primaryCategory,
        secondaryTag: score.secondaryTag,
        rubricBreakdown: score.rubricBreakdown as unknown,
        summary: score.summary,
        scoredAt: new Date(),
      },
    });

    if (website) {
      await tx.company.update({
        where: { id: companyId },
        data: { websiteAccessible: website.accessible, websiteCheckNote: website.note ?? null },
      });
    }
  });
}

export async function getCompanyBySlug(db: PrismaLike, slug: string): Promise<CompanyWithRelations | null> {
  return db.company.findUnique({ where: { slug }, include: { founders: true, score: true } });
}

export async function listCompaniesInBatch(db: PrismaLike, batchId: string): Promise<CompanyWithRelations[]> {
  return db.company.findMany({ where: { batchId }, include: { founders: true, score: true } });
}

/**
 * Every company across every batch, hydrated with founders/score. Used by
 * chat/search (Phase 3b), which need to reason across the whole dataset —
 * "what's the best company" or "find me the fintech ones" isn't scoped to
 * one batch. Filtering/sorting for those happens in application code
 * (`src/lib/chat/queryTools.ts`), not in a DB-level filter, on the same
 * reasoning already applied to the RAG design: batch sizes (150-300, a
 * handful of batches at a time) keep an in-memory scan fast enough that a
 * real search index would be solving a problem we don't have yet. Revisit
 * if historical backfill (Phase 5) ever pushes this into the tens of
 * thousands of rows.
 */
export async function listAllCompaniesWithRelations(db: PrismaLike): Promise<CompanyWithRelations[]> {
  return db.company.findMany({ include: { founders: true, score: true } });
}

export interface CategorizedCompanies {
  teamGeneral: CompanyWithRelations[];
  thesisFit: CompanyWithRelations[];
  unranked: CompanyWithRelations[];
}

/** Groups a batch's companies by primary category, sorted by their strongest score within each group. */
export function categorizeForDisplay(companies: CompanyWithRelations[]): CategorizedCompanies {
  const strengthOf = (c: CompanyWithRelations) =>
    Math.max(c.score?.teamGeneralScore ?? 0, c.score?.thesisAlignScore ?? 0);
  const byStrengthDesc = (a: CompanyWithRelations, b: CompanyWithRelations) => strengthOf(b) - strengthOf(a);

  return {
    teamGeneral: companies.filter((c) => c.score?.primaryCategory === "team_general").sort(byStrengthDesc),
    thesisFit: companies.filter((c) => c.score?.primaryCategory === "thesis_fit").sort(byStrengthDesc),
    unranked: companies.filter((c) => !c.score || c.score.primaryCategory === null),
  };
}
