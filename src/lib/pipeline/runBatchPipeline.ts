import type { PrismaLike } from "../db/prismaLike";
import { upsertBatch, upsertCompanyWithFounders, upsertScore } from "../db/repository";
import { ingestBatch } from "../yc/ingest";
import { scoreTriage } from "../scoring/triage";
import { scoreDeepDive } from "../scoring/deepDive";
import type { ThesisSnapshot } from "../thesis/types";
import type { NormalizedCompany } from "../yc/types";

export interface PipelineOptions {
  /** Either score qualifies at/above this on triage, the company gets a deep-dive pass. */
  deepDiveBar?: number;
  /** Cap how many companies get processed — for a cheap smoke test on a big batch. */
  limit?: number;
  onProgress?: (event: PipelineProgressEvent) => void;
}

export type PipelineProgressEvent =
  | { type: "ingesting" }
  | { type: "ingested"; count: number }
  | { type: "scoring"; company: string; index: number; total: number }
  | { type: "scored"; company: string; deepDived: boolean }
  | { type: "done"; count: number };

/**
 * Ingests a batch, triages every company, deep-dives whoever clears the
 * bar, and persists all of it. This is the one function the CLI
 * (scripts/run-pipeline.ts), and later the scheduled job (Phase 5), both
 * call — ingestion/scoring logic lives in exactly one place regardless of
 * what triggers it.
 */
export async function runBatchPipeline(
  db: PrismaLike,
  batchDisplayName: string,
  thesis: ThesisSnapshot,
  opts: PipelineOptions = {}
): Promise<{ processed: number }> {
  const { deepDiveBar = 6.5, limit = Infinity, onProgress } = opts;

  onProgress?.({ type: "ingesting" });
  const allCompanies = await ingestBatch(batchDisplayName);
  const companies = allCompanies.slice(0, limit);
  onProgress?.({ type: "ingested", count: companies.length });

  const batchRow = await upsertBatch(db, batchDisplayName, allCompanies.length);

  for (const [index, company] of companies.entries()) {
    onProgress?.({ type: "scoring", company: company.name, index, total: companies.length });
    const { deepDived } = await scoreAndPersistOne(db, batchRow.id, company, thesis, deepDiveBar);
    onProgress?.({ type: "scored", company: company.name, deepDived });
  }

  onProgress?.({ type: "done", count: companies.length });
  return { processed: companies.length };
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
