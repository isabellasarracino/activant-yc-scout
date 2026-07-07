import { NextResponse } from "next/server";
import { findLatestBatch, listBatches, toBatchSlug } from "../../../../lib/yc/mirror";
import { getDb } from "../../../../lib/db/client";
import { listBatchesFromDb } from "../../../../lib/db/repository";

/**
 * The newest batch YC has ever run, straight from the mirror — not from
 * our own database, which only knows about batches someone has actually
 * evaluated. This is what lets the dashboard say "Fall 2026 just
 * dropped, want Scout to look at it?" the moment a new batch appears,
 * before anyone has manually ingested anything.
 *
 * Deliberately scoped to just the single newest batch, not a full
 * historical list — see docs/PRIMER.md's Decisions table: a full
 * "browse any batch since 2022" picker was discussed and explicitly
 * deferred by the user, separately from this narrower feature.
 */
export async function GET() {
  try {
    const ycBatches = await listBatches();
    const latest = findLatestBatch(ycBatches);
    if (!latest) {
      return NextResponse.json({ error: "Could not determine the latest YC batch from the mirror." }, { status: 500 });
    }

    const slug = toBatchSlug(latest.displayName);
    const db = getDb();
    const ourBatches = await listBatchesFromDb(db);
    const alreadyEvaluated = ourBatches.some((b) => b.id === slug);

    return NextResponse.json({
      slug,
      displayName: latest.displayName,
      companyCount: latest.count,
      alreadyEvaluated,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
