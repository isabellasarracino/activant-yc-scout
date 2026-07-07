import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "../../../../lib/db/client";
import { listBatchesFromDb } from "../../../../lib/db/repository";
import { toBatchSlug } from "../../../../lib/yc/mirror";
import { dispatchScoreBatchWorkflow } from "../../../../lib/github/dispatch";

const EvaluateRequestSchema = z.object({
  batchName: z.string().trim().min(1, "batchName is required"),
});

/**
 * Starts evaluating a YC batch that hasn't been scored yet, by asking
 * GitHub Actions to run the pipeline (see
 * src/lib/github/dispatch.ts and .github/workflows/score-batch.yml) —
 * this endpoint itself does no scoring and returns almost immediately;
 * the actual work happens on GitHub's infrastructure over the following
 * minutes. The frontend tracks progress by polling
 * GET /api/batches/[batch], not by asking this endpoint about status.
 *
 * Guards against re-triggering a batch that's already been evaluated —
 * not for correctness (re-running is harmless, upsert-based) but to stop
 * an accidental double-click or page refresh from kicking off a second,
 * fully redundant, real-money batch run.
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
    if (ourBatches.some((b) => b.id === slug)) {
      return NextResponse.json(
        { error: `"${batchName}" has already been evaluated. Re-run it directly from a terminal if you want to refresh it.` },
        { status: 409 }
      );
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not check whether this batch was already evaluated." }, { status: 500 });
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
