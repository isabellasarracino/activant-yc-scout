import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "../../../../lib/db/client";
import { listBatchesFromDb } from "../../../../lib/db/repository";
import { toBatchSlug } from "../../../../lib/yc/mirror";
import { dispatchScoreBatchWorkflow } from "../../../../lib/github/dispatch";

const EvaluateRequestSchema = z.object({
  batchName: z.string().trim().min(1, "batchName is required"),
});

const RETRIGGER_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Starts (or re-starts) evaluating a YC batch by asking GitHub Actions to
 * run the pipeline (see src/lib/github/dispatch.ts and
 * .github/workflows/score-batch.yml) — this endpoint itself does no
 * scoring and returns almost immediately; the actual work happens on
 * GitHub's infrastructure over the following minutes. The frontend
 * tracks progress by polling GET /api/batches/[batch], not by asking
 * this endpoint about status.
 *
 * Re-triggering an already-evaluated batch is allowed and expected — YC
 * batches keep admitting companies for weeks, and `runBatchPipeline`
 * skips already-scored companies by default (see its doc comment), so a
 * re-run only pays for genuinely new companies. What's guarded against is
 * a *rapid* re-trigger (accidental double-click, page refresh) firing a
 * second, likely-redundant GitHub Actions run before the first one could
 * possibly have finished ingesting — a 5-minute cooldown keyed on the
 * batch's lastSyncedAt (set the moment a run starts ingesting, before any
 * scoring) catches that case without blocking a legitimate re-check days
 * or weeks later.
 *
 * No other access control on this endpoint — anyone who can reach the
 * site can trigger a real, paid GitHub Actions run. Acceptable for an
 * internal analyst tool passed around a small team; revisit (e.g. Vercel
 * deployment protection, or a shared-secret check here) before this is
 * ever exposed more broadly.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = EvaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const { batchName } = parsed.data;
  const slug = toBatchSlug(batchName);

  try {
    const db = getDb();
    const ourBatches = await listBatchesFromDb(db);
    const existing = ourBatches.find((b) => b.id === slug);
    if (existing) {
      const msSinceLastSync = Date.now() - existing.lastSyncedAt.getTime();
      if (msSinceLastSync < RETRIGGER_COOLDOWN_MS) {
        const secondsLeft = Math.ceil((RETRIGGER_COOLDOWN_MS - msSinceLastSync) / 1000);
        return NextResponse.json(
          { error: `"${batchName}" was just triggered — wait about ${secondsLeft}s before trying again (this guards against an accidental double-trigger, not against re-checking a batch that's grown).` },
          { status: 409 }
        );
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not check this batch's status." }, { status: 500 });
  }

  try {
    await dispatchScoreBatchWorkflow(batchName);
    return NextResponse.json({
      ok: true,
      message: `Started evaluating "${batchName}". This runs in the background and can take a while for a large batch.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to start evaluation." }, { status: 500 });
  }
}
