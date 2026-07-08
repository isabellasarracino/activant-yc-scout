import { NextResponse } from "next/server";
import { EARLIEST_TRACKED_BATCH, findBatchesFrom, listBatches } from "../../../../lib/yc/mirror";
import { getDb } from "../../../../lib/db/client";
import { listBatchesFromDb } from "../../../../lib/db/repository";

/**
 * Every YC batch from Summer 2026 onward, straight from the mirror — not
 * from our own database, which only knows about batches someone has
 * actually evaluated — each annotated with whether we've evaluated it at
 * all and whether it's grown since we last checked. This is what powers
 * the dashboard's dropdown and its per-batch "Evaluate this batch" /
 * "N new companies" actions.
 *
 * Deliberately scoped to "Summer 2026 onward," not a full "every YC batch
 * since 2022" browser — see EARLIEST_TRACKED_BATCH and docs/PRIMER.md's
 * Decisions table: a full historical backfill was discussed with the
 * user and explicitly deferred, separately from this narrower feature.
 */
export async function GET() {
  try {
    const ycBatches = await listBatches();
    const relevant = findBatchesFrom(ycBatches, EARLIEST_TRACKED_BATCH);

    const db = getDb();
    const ourBatches = await listBatchesFromDb(db);
    const ourBySlug = new Map(ourBatches.map((b) => [b.id, b]));

    const result = relevant.map((b) => {
      const ours = ourBySlug.get(b.slug);
      const ourCompanyCount = ours?.companyCount ?? 0;
      return {
        slug: b.slug,
        displayName: b.displayName,
        mirrorCompanyCount: b.count,
        ourCompanyCount,
        alreadyEvaluated: ourCompanyCount > 0,
        hasNewCompanies: b.count > ourCompanyCount,
      };
    });

    return NextResponse.json({ batches: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
