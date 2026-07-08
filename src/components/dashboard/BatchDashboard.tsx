"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchBatchDetail,
  fetchYcBatches,
  ApiError,
  type BatchDetailResponse,
  type YcBatchInfo,
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
 * Home page's main content. The dropdown (BatchSwitcher) is driven by
 * GET /api/yc/batches — every batch from Summer 2026 onward, whether or
 * not we've evaluated it — not by our own database's batch list, so a
 * batch YC just announced shows up immediately, labeled "not yet
 * evaluated," rather than only appearing once someone has already run
 * the pipeline for it. See docs/ARCHITECTURE.md#website-triggered-evaluation.
 *
 * Selecting a batch that hasn't been evaluated (or that's grown since it
 * was last evaluated) shows EvaluateBatchBanner instead of / above the
 * normal ranked list; clicking it triggers the same on-demand GitHub
 * Actions flow for whichever batch is currently selected, not just "the
 * single newest batch ever" — every batch gets its own evaluate action.
 */
export function BatchDashboard() {
  const [ycBatchesState, setYcBatchesState] = useState<LoadState>("loading");
  const [ycBatches, setYcBatches] = useState<YcBatchInfo[]>([]);
  const [ycBatchesError, setYcBatchesError] = useState<string | null>(null);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<BatchDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [evaluating, setEvaluating] = useState<{ slug: string; displayName: string; targetCompanyCount: number } | null>(null);

  const loadYcBatches = useCallback((selectDefault: boolean) => {
    fetchYcBatches()
      .then((list) => {
        setYcBatches(list);
        setYcBatchesState("ready");
        if (selectDefault && list.length > 0) {
          const preferred = list.find((b) => b.alreadyEvaluated) ?? list[0]!;
          setSelectedBatchId(preferred.slug);
        }
      })
      .catch((err) => {
        setYcBatchesError(friendlyError(err instanceof ApiError ? err.message : "Couldn't load batches."));
        setYcBatchesState("error");
      });
  }, []);

  const loadDetail = useCallback((batchId: string) => {
    setDetailState("loading");
    setDetailError(null);
    fetchBatchDetail(batchId)
      .then((d) => {
        setDetail(d);
        setDetailState("ready");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          // Not an error — this batch just hasn't been evaluated yet.
          setDetail(null);
          setDetailState("ready");
        } else {
          setDetailError(friendlyError(err instanceof ApiError ? err.message : "Couldn't load this batch."));
          setDetailState("error");
        }
      });
  }, []);

  useEffect(() => {
    loadYcBatches(true);
  }, [loadYcBatches]);

  useEffect(() => {
    if (selectedBatchId) loadDetail(selectedBatchId);
  }, [selectedBatchId, loadDetail]);

  function handleEvaluationStarted() {
    const selected = ycBatches.find((b) => b.slug === selectedBatchId);
    if (!selected) return;
    setEvaluating({ slug: selected.slug, displayName: selected.displayName, targetCompanyCount: selected.mirrorCompanyCount });
  }

  function handleEvaluationDone() {
    const finishedSlug = evaluating?.slug ?? null;
    setEvaluating(null);
    loadYcBatches(false);
    if (finishedSlug) loadDetail(finishedSlug);
  }

  if (ycBatchesState === "loading") {
    return <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>Loading batches…</p>;
  }

  if (ycBatchesState === "error") {
    return <p style={{ color: "var(--danger)", fontSize: 14 }}>{ycBatchesError}</p>;
  }

  if (ycBatches.length === 0) {
    return <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>No YC batches found from Summer 2026 onward.</p>;
  }

  const selectedYcInfo = ycBatches.find((b) => b.slug === selectedBatchId);
  const newCompanyCount = selectedYcInfo ? selectedYcInfo.mirrorCompanyCount - selectedYcInfo.ourCompanyCount : 0;
  const showBanner = !evaluating && selectedYcInfo && newCompanyCount > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-muted)" }}>
            {detail ? `Last synced ${new Date(detail.batch.lastSyncedAt).toLocaleString()}` : "\u00A0"}
          </p>
        </div>
        {selectedBatchId && <BatchSwitcher batches={ycBatches} selectedBatchId={selectedBatchId} onChange={setSelectedBatchId} />}
      </div>

      {showBanner && selectedYcInfo && (
        <EvaluateBatchBanner
          displayName={selectedYcInfo.displayName}
          newCompanyCount={newCompanyCount}
          isFirstEvaluation={!selectedYcInfo.alreadyEvaluated}
          onStarted={handleEvaluationStarted}
        />
      )}

      {evaluating && (
        <EvaluationProgress
          batchSlug={evaluating.slug}
          displayName={evaluating.displayName}
          expectedCompanyCount={evaluating.targetCompanyCount}
          onDone={handleEvaluationDone}
        />
      )}

      {!evaluating && detailState === "loading" && <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>Loading companies…</p>}
      {!evaluating && detailState === "error" && <p style={{ color: "var(--danger)", fontSize: 14 }}>{detailError}</p>}

      {!evaluating && detailState === "ready" && detail === null && !showBanner && (
        <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>This batch hasn&apos;t been evaluated yet.</p>
      )}

      {!evaluating && detail && detailState === "ready" && (
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
    </div>
  );
}
