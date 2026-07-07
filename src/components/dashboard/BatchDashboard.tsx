"use client";

import { useCallback, useEffect, useState } from "react";
import type { BatchDTO } from "../../lib/api/serialize";
import {
  fetchBatchDetail,
  fetchBatches,
  fetchLatestYcBatch,
  ApiError,
  type BatchDetailResponse,
  type LatestYcBatch,
} from "../../lib/api/client";
import { BatchSwitcher } from "./BatchSwitcher";
import { CompanyGrid } from "./CompanyGrid";
import { EvaluateBatchBanner } from "./EvaluateBatchBanner";
import { EvaluationProgress } from "./EvaluationProgress";

type LoadState = "loading" | "ready" | "error";

/**
 * The raw error from a misconfigured server (e.g. `getDb()` throwing
 * "DATABASE_URL is not set") is accurate but reads like a crash to
 * someone who isn't the one setting up the database. Reframe the couple
 * of known "this just isn't configured yet" cases in plainer terms,
 * while still showing the technical detail in parentheses for whoever
 * is doing that setup.
 */
function friendlyError(message: string): string {
  if (/DATABASE_URL/i.test(message)) {
    return `This app isn't connected to a database yet. (${message})`;
  }
  if (/ANTHROPIC_API_KEY|OPENROUTER_API_KEY|api key/i.test(message)) {
    return `This app isn't connected to Claude yet. (${message})`;
  }
  return message;
}

/**
 * Home page's main content. Defaults to the most recently synced batch —
 * `GET /api/batches` already comes back ordered newest-first
 * (`listBatchesFromDb`'s `orderBy: lastSyncedAt desc`), so "the batch
 * that's currently in progress" is just index 0, no separate "latest"
 * endpoint needed for *browsing*. Switching batches re-fetches detail
 * client-side; there's no separate "history" mode (docs/ARCHITECTURE.md#chat--qa
 * makes the same point for chat) — an old batch renders exactly the same
 * way a new one does.
 *
 * Separately, this also checks whether YC has a *newer* batch than
 * anything in our database at all (GET /api/yc/latest-batch) and, if so,
 * shows a banner offering to evaluate it — independent of whatever batch
 * is currently selected for browsing below. See
 * docs/ARCHITECTURE.md#website-triggered-evaluation.
 */
export function BatchDashboard() {
  const [batchesState, setBatchesState] = useState<LoadState>("loading");
  const [batches, setBatches] = useState<BatchDTO[]>([]);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<BatchDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [latestYc, setLatestYc] = useState<LatestYcBatch | null>(null);
  const [evaluating, setEvaluating] = useState<{ slug: string; displayName: string; companyCount: number } | null>(null);

  const loadBatches = useCallback((selectNewest: boolean) => {
    fetchBatches()
      .then((list) => {
        setBatches(list);
        setBatchesState("ready");
        if (selectNewest && list.length > 0) setSelectedBatchId(list[0]!.id);
      })
      .catch((err) => {
        setBatchesError(friendlyError(err instanceof ApiError ? err.message : "Couldn't load batches."));
        setBatchesState("error");
      });
  }, []);

  useEffect(() => {
    loadBatches(true);
    fetchLatestYcBatch()
      .then(setLatestYc)
      .catch(() => {
        // Non-critical: if the mirror is unreachable or misconfigured,
        // just skip the "new batch available" banner rather than
        // surfacing a second error state on top of the main one.
      });
  }, [loadBatches]);

  useEffect(() => {
    if (!selectedBatchId) return;
    let cancelled = false;
    setDetailState("loading");
    setDetailError(null);
    fetchBatchDetail(selectedBatchId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setDetailState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setDetailError(friendlyError(err instanceof ApiError ? err.message : "Couldn't load this batch."));
        setDetailState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatchId]);

  function handleEvaluationStarted() {
    if (!latestYc) return;
    setEvaluating({ slug: latestYc.slug, displayName: latestYc.displayName, companyCount: latestYc.companyCount });
  }

  function handleEvaluationDone() {
    const finishedSlug = evaluating?.slug ?? null;
    setEvaluating(null);
    loadBatches(false);
    if (finishedSlug) setSelectedBatchId(finishedSlug);
    fetchLatestYcBatch().then(setLatestYc).catch(() => {});
  }

  const showNewBatchBanner = latestYc && !latestYc.alreadyEvaluated && !evaluating;

  if (batchesState === "loading") {
    return <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>Loading batches…</p>;
  }

  if (batchesState === "error") {
    return <p style={{ color: "var(--danger)", fontSize: 14 }}>{batchesError}</p>;
  }

  return (
    <div>
      {showNewBatchBanner && (
        <EvaluateBatchBanner displayName={latestYc.displayName} companyCount={latestYc.companyCount} onStarted={handleEvaluationStarted} />
      )}
      {evaluating && (
        <EvaluationProgress
          batchSlug={evaluating.slug}
          displayName={evaluating.displayName}
          expectedCompanyCount={evaluating.companyCount}
          onDone={handleEvaluationDone}
        />
      )}

      {batches.length === 0 && !evaluating && (
        <div style={{ maxWidth: 480 }}>
          <p style={{ fontSize: 14, color: "var(--ink)" }}>No batches evaluated yet.</p>
          <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>
            {showNewBatchBanner
              ? "Use the banner above, or run this from a terminal:"
              : "Run the pipeline once a database and OpenRouter API key are configured:"}
          </p>
          <pre
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: 12,
              overflowX: "auto",
            }}
          >
            npm run pipeline -- &quot;Summer 2026&quot; --limit=10
          </pre>
        </div>
      )}

      {batches.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--ink-muted)" }}>
                {detail ? `Last synced ${new Date(detail.batch.lastSyncedAt).toLocaleString()}` : "\u00A0"}
              </p>
            </div>
            {selectedBatchId && <BatchSwitcher batches={batches} selectedBatchId={selectedBatchId} onChange={setSelectedBatchId} />}
          </div>

          {detailState === "loading" && <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>Loading companies…</p>}
          {detailState === "error" && <p style={{ color: "var(--danger)", fontSize: 14 }}>{detailError}</p>}

          {detail && detailState === "ready" && (
            <>
              <CompanyGrid
                title="All Companies"
                accent="var(--ink)"
                companies={detail.ranked}
                emptyMessage="No companies have been scored yet."
                rank
              />
              {detail.unranked.length > 0 && (
                <details>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "var(--ink-muted)",
                      marginBottom: 12,
                    }}
                  >
                    {detail.unranked.length} not yet evaluated
                  </summary>
                  <p style={{ fontSize: 12.5, color: "var(--ink-muted)", margin: "0 0 12px", fontStyle: "italic" }}>
                    Scout hasn&apos;t been able to look into these companies yet — they&apos;re ingested but not scored.
                  </p>
                  <CompanyGrid title="Not yet evaluated" accent="var(--line)" companies={detail.unranked} emptyMessage="" />
                </details>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
