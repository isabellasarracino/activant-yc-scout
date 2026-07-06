import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db/client";
import { listBatchesFromDb } from "../../../lib/db/repository";
import { serializeBatch } from "../../../lib/api/serialize";

/**
 * Read-only by design — ingestion/scoring only ever happens from the CLI
 * (scripts/run-pipeline.ts) or, from Phase 5, a GitHub Actions cron, never
 * from a request handler. See docs/ARCHITECTURE.md#automation for why.
 */
export async function GET() {
  try {
    const db = getDb();
    const batches = await listBatchesFromDb(db);
    return NextResponse.json({ batches: batches.map(serializeBatch) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
