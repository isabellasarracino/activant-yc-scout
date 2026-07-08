import type { PrismaLike } from "../db/prismaLike";
import { listCompaniesInBatch, upsertBatch, upsertCompanyWithFounders, upsertScore } from "../db/repository";
import { ingestBatch } from "../yc/ingest";
import { scoreTriage } from "../scoring/triage";
import { scoreDeepDive } from "../scoring/deepDive";
import { withRetries } from "../retry";
import type { ThesisSnapshot } from "../thesis/types";
import type { NormalizedCompany } from "../yc/types";
import type { ScoreResult } from "../scoring/types";

export interface PipelineOptions {
  deepDiveBar?: number;
  limit?: number;
  /** Re-score companies that already have a score, instead of skipping them (the default). See runBatchPipeline's doc comment for why skipping is the default. */
  force?: boolean;
  /** Delay between retry attempts — overridable so tests don't have to wait on real timers. Real usage should leave this at the default. */
  retryDelayMs?: number;
  onProgress?: (event: PipelineProgressEvent) => void;
}

export type PipelineProgressEvent =
  | { type: "ingesting" }
  | { type: "ingested"; count: number }
  | { type: "scoring"; company: string; index: number; total: number }
  | { type: "scored"; company: string; deepDived: boolean }
  | { type: "skipped"; company: string; index: number; total: number }
  | { type: "failed"; company: string; error: string }
  | { type: "done"; count: number; skipped: number; failed: number };

/**
 * Ingests a batch, triages every company, deep-dives whoever clears the
 * bar, and persists all of it. This is the one function the CLI
 * (scripts/run-pipeline.ts) and the website's on-demand trigger
 * (POST /api/batches/evaluate -> GitHub Actions ->
 * .github/workflows/score-batch.yml) both call — ingestion/scoring logic
 * lives in exactly one place regardless of what triggers it.
 *
 * One company's scoring failure does NOT abort the run. Learned the hard
 * way on the real Summer 2026 batch: company #4 of 62 failed with a
 * malformed model response, and an earlier all-or-nothing version threw
 * away the 3 already-scored (and already-paid-for) companies and never
 * attempted the remaining 58. Each company is now caught independently;
 * a failure is logged via onProgress and the run continues.
 *
 * A company that already has a score is SKIPPED by default, not
 * re-scored. YC batches keep admitting companies for weeks after they're
 * first announced — a batch that had 4 companies when first evaluated
 * might have 60 a month later. Without this, re-running to pick up new
 * companies would re-score everyone all over again: real wasted API
 * cost, and worse, a real risk of silently changing a score out from
 * under someone who already reviewed it, just because the model's output
 * isn't perfectly deterministic run to run. Pass `force: true` (the CLI's
 * `--rescore` flag) to intentionally re-score everyone anyway — e.g.
 * after a rubric or thesis change that should be reflected everywhere.
 *
 * A company should not need a second pipeline run to end up ranked.
 * `scoreAndPersistOne` retries a failed triage call once, and if it still
 * fails, falls back to attempting deep-dive directly instead (a
 * differently-shaped call — adds the company's own website — with a real
 * chance of succeeding where triage didn't, particularly for the kind of
 * malformed-response failure this project has actually hit in
 * production). If triage succeeded and deep-dive is the one that fails
 * (even after its own retry), the already-good triage score is persisted
 * rather than leaving the company with nothing. The only way a company
 * still ends up unranked after a run is if *both* triage and deep-dive
 * fail even after retries — at that point the underlying API is very
 * likely down or misconfigured, and no amount of in-process retrying
 * would fix that; the failure is logged and the batch continues rather
 * than the whole run aborting. See docs/ARCHITECTURE.md#scoring-design.
 */
export async function runBatchPipeline(
  db: PrismaLike,
  batchDisplayName: string,
  thesis: ThesisSnapshot,
  opts: PipelineOptions = {}
): Promise<{ processed: number; skipped: number; failed: number; failedCompanies: string[] }> {
  const { deepDiveBar = 6.5, limit = Infinity, force = false, retryDelayMs = 1000, onProgress } = opts;

  onProgress?.({ type: "ingesting" });
  const allCompanies = await ingestBatch(batchDisplayName);
  const companies = allCompanies.slice(0, limit);
  onProgress?.({ type: "ingested", count: companies.length });

  const batchRow = await upsertBatch(db, batchDisplayName, allCompanies.length);

  const existing = force ? [] : await listCompaniesInBatch(db, batchRow.id);
  const alreadyScoredSlugs = new Set(existing.filter((c) => c.score !== null).map((c) => c.slug));

  const failedCompanies: string[] = [];
  let skipped = 0;
  for (const [index, company] of companies.entries()) {
    if (!force && alreadyScoredSlugs.has(company.slug)) {
      skipped++;
      onProgress?.({ type: "skipped", company: company.name, index, total: companies.length });
      continue;
    }
    onProgress?.({ type: "scoring", company: company.name, index, total: companies.length });
    try {
      const { deepDived } = await scoreAndPersistOne(db, batchRow.id, company, thesis, deepDiveBar, retryDelayMs);
      onProgress?.({ type: "scored", company: company.name, deepDived });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failedCompanies.push(company.name);
      onProgress?.({ type: "failed", company: company.name, error: message });
    }
  }

  onProgress?.({ type: "done", count: companies.length, skipped, failed: failedCompanies.length });
  return {
    processed: companies.length - failedCompanies.length - skipped,
    skipped,
    failed: failedCompanies.length,
    failedCompanies,
  };
}

/**
 * Triage, with a deep-dive fallback if triage can't produce a score at
 * all, and a triage fallback if deep-dive is the one that fails after
 * triage already succeeded — see runBatchPipeline's doc comment above
 * for the full reasoning. Each stage gets one retry before falling back
 * or giving up.
 */
async function scoreAndPersistOne(
  db: PrismaLike,
  batchId: string,
  company: NormalizedCompany,
  thesis: ThesisSnapshot,
  deepDiveBar: number,
  retryDelayMs: number
): Promise<{ deepDived: boolean }> {
  const { id: companyId } = await upsertCompanyWithFounders(db, batchId, company);

  let triage: ScoreResult | null = null;
  try {
    triage = await withRetries(() => scoreTriage({ company, thesis }), 1, retryDelayMs);
  } catch {
    // Triage failed even after a retry — fall through to attempt
    // deep-dive directly below, rather than giving up on this company.
  }

  const clearsBar = triage ? triage.teamGeneralScore >= deepDiveBar || triage.thesisAlignScore >= deepDiveBar : true;

  if (triage && !clearsBar) {
    await upsertScore(db, companyId, triage);
    return { deepDived: false };
  }

  // Either triage cleared the bar (the normal deep-dive path), or triage
  // itself failed (the fallback path) — either way, attempt deep-dive.
  try {
    const deepDive = await withRetries(() => scoreDeepDive({ company, thesis }), 1, retryDelayMs);
    await upsertScore(db, companyId, deepDive, {
      accessible: deepDive.websiteAccessible,
      note: deepDive.websiteCheckNote,
    });
    return { deepDived: true };
  } catch (deepDiveErr) {
    if (triage) {
      // Deep-dive failed, but a valid triage score is already in hand —
      // persist that rather than leaving the company fully unranked.
      await upsertScore(db, companyId, triage);
      return { deepDived: false };
    }
    throw new Error(
      `Both triage and the deep-dive fallback failed for "${company.name}": ${deepDiveErr instanceof Error ? deepDiveErr.message : String(deepDiveErr)}`
    );
  }
}
