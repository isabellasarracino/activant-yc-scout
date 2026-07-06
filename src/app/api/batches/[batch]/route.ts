import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { categorizeForDisplay, listBatchesFromDb, listCompaniesInBatch } from "../../../../lib/db/repository";
import { serializeBatch, serializeCompanyCompact } from "../../../../lib/api/serialize";

/**
 * Companies come back grouped into exactly the two headline lists plus
 * "unranked" — never a company in both lists, per the product
 * requirement — via the same `categorizeForDisplay` the storage layer
 * already uses, so the grouping logic lives in exactly one place. Each
 * company is the compact shape; the frontend fetches full per-dimension
 * detail from GET /api/companies/[slug] only when a card is expanded.
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
    const grouped = categorizeForDisplay(companies);

    return NextResponse.json({
      batch: serializeBatch(batchRow),
      teamGeneral: grouped.teamGeneral.map(serializeCompanyCompact),
      thesisFit: grouped.thesisFit.map(serializeCompanyCompact),
      unranked: grouped.unranked.map(serializeCompanyCompact),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
