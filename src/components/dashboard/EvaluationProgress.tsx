"use client";

import { useEffect, useRef, useState } from "react";
import { fetchBatchDetail } from "../../lib/api/client";

interface EvaluationProgressProps {
  batchSlug: string;
  displayName: string;
  expectedCompanyCount: number;
  onDone: () => void;
  /** Overridable for tests, which shouldn't have to wait on a real 12-second interval to see a second poll. */
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 12_000;
/** Before any real progress exists, a rough starting guess — replaced the moment at least one company has actually been scored, by a real observed average instead of a guess. */
const INITIAL_MS_PER_COMPANY_ESTIMATE = 8_000;

/**
 * Polls our own database (GET /api/batches/[batch]) rather than asking
 * GitHub about the Actions run's status — see
 * src/lib/github/dispatch.ts for why (GitHub's dispatch API doesn't hand
 * back a run ID to track in the first place). "Done" is detected as
 * "every company in the batch has at least been attempted"
 * (ranked.length + unranked.length >= expectedCompanyCount), not "zero
 * unranked" — a company that failed to score stays in `unranked`
 * forever (see docs/ARCHITECTURE.md#scoring-design's pipeline-resilience
 * story), so waiting for zero would hang forever if anything failed.
 */
export function EvaluationProgress({ batchSlug, displayName, expectedCompanyCount, onDone, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS }: EvaluationProgressProps) {
  const [seen, setSeen] = useState(0);
  const [scored, setScored] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const detail = await fetchBatchDetail(batchSlug);
        if (cancelled) return;
        const totalSeen = detail.ranked.length + detail.unranked.length;
        setSeen(totalSeen);
        setScored(detail.ranked.length);
        if (totalSeen > 0 && totalSeen >= expectedCompanyCount) {
          doneRef.current = true;
          onDoneRef.current();
          return;
        }
      } catch (err) {
        // A 404 just means ingestion hasn't created the batch row yet —
        // keep waiting quietly rather than treating it as a real error.
        // Any other error: also keep polling, since this is tracking a
        // background job that might just be slow, not failed.
        void err;
      }
      if (!cancelled && !doneRef.current) {
        timeoutId = setTimeout(poll, pollIntervalMs);
      }
    }
    poll();

    const tickTimer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      clearInterval(tickTimer);
    };
  }, [batchSlug, expectedCompanyCount]);

  const elapsedMs = now - startedAt;
  const msPerCompany = scored > 0 ? elapsedMs / scored : INITIAL_MS_PER_COMPANY_ESTIMATE;
  const remainingCompanies = Math.max(expectedCompanyCount - seen, 0);
  const estimatedRemainingMs = remainingCompanies * msPerCompany;
  const progressPct = expectedCompanyCount > 0 ? Math.min(100, Math.round((seen / expectedCompanyCount) * 100)) : 0;

  return (
    <div style={{ maxWidth: 480, padding: "24px 0" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 8px", color: "var(--ink)" }}>Evaluating {displayName}…</h2>
      <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 16px" }}>
        Scout is scoring every company in this batch in the background — this can take a while for a large batch.
        Feel free to leave this page; it&apos;ll pick up right where it left off when you come back.
      </p>
      <div
        style={{
          background: "var(--surface-sunken)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          height: 10,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: "100%",
            background: "var(--team)",
            transition: "width 400ms ease",
          }}
        />
      </div>
      <p style={{ fontSize: 12.5, color: "var(--ink-muted)", fontFamily: "var(--font-mono)", margin: 0 }}>
        {seen} of {expectedCompanyCount} companies seen{scored > 0 ? `, ${scored} scored` : ""} — {progressPct}%
      </p>
      <p style={{ fontSize: 13, color: "var(--ink)", marginTop: 12 }}>
        {seen === 0
          ? "Starting up — this can take a minute before the first company shows up."
          : `About ${formatDuration(estimatedRemainingMs)} remaining (rough estimate, based on progress so far).`}
      </p>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
