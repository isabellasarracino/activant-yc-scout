import type { PrismaLike } from "../db/prismaLike";
import { upsertBatch, upsertCompanyWithFounders, upsertScore } from "../db/repository";
import { ingestBatch } from "../yc/ingest";
import { scoreTriage } from "../scoring/triage";
import { scoreDeepDive } from "../scoring/deepDive";
import type { ThesisSnapshot } from "../thesis/types";
import type { NormalizedCompany } from "../yc/types";

export interface PipelineOptions {
  deepDiveBar?: number;
  limit?: number;
  onProgress?: (event: PipelineProgressEvent) => void;
}

export type PipelineProgressEvent =
  | { type: "ingesting" }
  | { type: "ingested"; count: number }
  | { type: "scoring"; company: string; index: number; total: number }
  | { type: "scored"; company: string; deepDived: boolean }
  | { type: "failed"; company: string; error: string }
  | { type: "done"; count: number; failed: number };

/**
 * Ingests a batch, triages every company, deep-dives whoever clears the
 * bar, and persists all of it. This is the one function the CLI
 * (scripts/run-pipeline.ts), and later the scheduled job (Phase 5), both
 * call — ingestion/scoring logic lives in exactly one place regardless of
 * what triggers it.
 *
 * One company's scoring failure does NOT abort the run. Learned the hard
 * way on the real Summer 2026 batch: company #4 of 62 failed with a
 * malformed model response, and an earlier all-or-nothing version threw
 * away the 3 already-scored (and already-paid-for) companies and never
 * attempted the remaining 58. Each company is now caught independently;
 * a failure is logged via onProgress and the run continues.
 */
export async function runBatchPipeline(
  db: PrismaLike,
  batchDisplayName: string,
  thesis: ThesisSnapshot,
  opts: PipelineOptions = {}
): Promise<{ processed: number; failed: number; failedCompanies: string[] }> {
  const { deepDiveBar = 6.5, limit = Infinity, onProgress } = opts;

  onProgress?.({ type: "ingesting" });
  const allCompanies = await ingestBatch(batchDisplayName);
  const companies = allCompanies.slice(0, limit);
  onProgress?.({ type: "ingested", count: companies.length });

  const batchRow = await upsertBatch(db, batchDisplayName, allCompanies.length);

  const failedCompanies: string[] = [];
  for (const [index, company] of companies.entries()) {
    onProgress?.({ type: "scoring", company: company.name, index, total: companies.length });
    try {
      const { deepDived } = await scoreAndPersistOne(db, batchRow.id, company, thesis, deepDiveBar);
      onProgress?.({ type: "scored", company: company.name, deepDived });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failedCompanies.push(company.name);
      onProgress?.({ type: "failed", company: company.name, error: message });
    }
  }

  onProgress?.({ type: "done", count: companies.length, failed: failedCompanies.length });
  return { processed: companies.length - failedCompanies.length, failed: failedCompanies.length, failedCompanies };
}

async function scoreAndPersistOne(
  db: PrismaLike,
  batchId: string,
  company: NormalizedCompany,
  thesis: ThesisSnapshot,
  deepDiveBar: number
): Promise<{ deepDived: boolean }> {
  const { id: companyId } = await upsertCompanyWithFounders(db, batchId, company);

  const triage = await scoreTriage({ company, thesis });
  const clearsBar = triage.teamGeneralScore >= deepDiveBar || triage.thesisAlignScore >= deepDiveBar;

  if (!clearsBar) {
    await upsertScore(db, companyId, triage);
    return { deepDived: false };
  }

  const deepDive = await scoreDeepDive({ company, thesis });
  await upsertScore(db, companyId, deepDive, {
    accessible: deepDive.websiteAccessible,
    note: deepDive.websiteCheckNote,
  });
  return { deepDived: true };
}
