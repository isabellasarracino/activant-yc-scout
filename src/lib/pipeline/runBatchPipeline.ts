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