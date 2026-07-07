import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { rankCompaniesForDisplay, listBatchesFromDb, listCompaniesInBatch } from "../../../../lib/db/repository";
import { serializeBatch, serializeCompanyCompact } from "../../../../lib/api/serialize";

/**
 * Companies come back as one list, ranked by combined score (team +
 * thesis) descending, plus a separate "unranked" list for companies with
 * no score at all yet — via the same `rankCompaniesForDisplay` the
 * storage layer already uses, so the ranking logic lives in exactly one
 * place. Each company still carries its own primaryCategory/secondaryTag
 * for a badge; this is a display-grouping choice (one list vs. the
 * earlier two-list split), not a change to categorization itself — see
 * docs/ARCHITECTURE.md#categorization. Each company is the compact
 * shape; the frontend fetches full per-dimension detail from
 * GET /api/companies/[slug] only when a card is expanded.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ batch: string }> }) {
  try {
    const { batch: batchId } = await params;
    const db = getDb();

    const batches = await listBatchesFromDb(db);
    const batchRow = batches.find((b) => b.id === batchId);
    if (!batchRow) {
      return NextResponse.json({ error: `No batch found with id "${batchId}".` }, { status: 404 });
    }

    const companies = await listCompaniesInBatch(db, batchId);
    const { ranked, unranked } = rankCompaniesForDisplay(companies);

    return NextResponse.json({
      batch: serializeBatch(batchRow),
      ranked: ranked.map(serializeCompanyCompact),
      unranked: unranked.map(serializeCompanyCompact),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
