"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchBatchDetail,
  fetchYcBatches,
  ApiError,
  type BatchDetailResponse,
  type YcBatchInfo,
} from "../../lib/api/client";
import type { CompanyCompactDTO } from "../../lib/api/serialize";
import { BatchSwitcher } from "./BatchSwitcher";
import { CompanyGrid } from "./CompanyGrid";
import { EvaluateBatchBanner } from "./EvaluateBatchBanner";
import { EvaluationProgress } from "./EvaluationProgress";

type LoadState = "loading" | "ready" | "error";

/**
 * View modes for the "All Companies" sort control. All four operate on
 * the same already-fetched `detail.ranked` array client-side -- no extra
 * API call, since every field each mode needs (teamGeneralScore,
 * thesisAlignScore, primaryCategory, primaryVertical) is already on
 * CompanyCompactDTO.
 *
 * Ranking within every mode is always by combined score (team + thesis)
 * -- "team_general"/"thesis_fit" filter to that category but don't
 * re-rank by the single axis, and "vertical" groups into per-vertical
 * headings with combined-score ranking inside each group. Combined score
 * is the one consistent ranking signal across the whole dashboard; only
 * *which companies show* and *how they're grouped* changes per mode.
 */
type SortMode = "combined" | "team_general" | "thesis_fit" | "vertical";

const SORT_LABELS: Record<SortMode, string> = {
  combined: "Combined score",
  team_general: "Team & General only",
  thesis_fit: "Thesis Fit only",
  vertical: "By vertical",
};

function combinedScore(c: CompanyCompactDTO): number {
  return (c.teamGeneralScore ?? 0) + (c.thesisAlignScore ?? 0);
}

/** Filters to one category, ranked by combined score (not the single axis) -- combined score is the one consistent ranking signal across every view. */
function filterByCategory(companies: CompanyCompactDTO[], category: "team_general" | "thesis_fit"): CompanyCompactDTO[] {
  return companies.filter((c) => c.primaryCategory === category).sort((a, b) => combinedScore(b) - combinedScore(a));
}

export interface VerticalGroup {
  vertical: string;
  companies: CompanyCompactDTO[];
}

/**
 * Groups companies by their model-extracted `primaryVertical` (e.g.
 * "Fintech", "Healthcare") -- each company's vertical was decided
 * individually at scoring time (src/lib/scoring/scoreTool.ts), this just
 * clusters the results. Verticals are ordered alphabetically for a
 * stable, predictable heading order; companies inside each vertical are
 * ranked by combined score descending, same as every other view.
 * Unlabeled companies (scored before this field existed) are grouped
 * under "Unlabeled" and sorted last.
 */
function groupByVertical(companies: CompanyCompactDTO[]): VerticalGroup[] {
  const buckets = new Map<string, CompanyCompactDTO[]>();
  for (const c of companies) {
    const key = c.primaryVertical ?? "Unlabeled";
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  const groups = Array.from(buckets.entries()).map(([vertical, list]) => ({
    vertical,
    companies: [...list].sort((a, b) => combinedScore(b) - combinedScore(a)),
  }));

  groups.sort((a, b) => {
    if (a.vertical === "Unlabeled") return 1;
    if (b.vertical === "Unlabeled") return -1;
    return a.vertical.localeCompare(b.vertical);
  });

  return groups;
}

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
 * GET /api/yc/batches -- every batch from Summer 2026 onward, whether or
 * not we've evaluated it -- not by our own database's batch list, so a
 * batch YC just announced shows up immediately, labeled "not yet
 * evaluated," rather than only appearing once someone has already run
 * the pipeline for it. See docs/ARCHITECTURE.md#website-triggered-evaluation.
 *
 * Selecting a batch that hasn't been evaluated (or that's grown since it
 * was last evaluated) shows EvaluateBatchBanner instead of / above the
 * normal ranked list; clicking it triggers the same on-demand GitHub
 * Actions flow for whichever batch is currently selected, not just "the
 * single newest batch ever" -- every batch gets its own evaluate action.
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

  const [sortMode, setSortMode] = useState<SortMode>("combined");

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
          // Not an error -- this batch just hasn't been evaluated yet.
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

  const filteredRanked = useMemo(() => {
    if (!detail) return [];
    if (sortMode === "team_general" || sortMode === "thesis_fit") return filterByCategory(detail.ranked, sortMode);
    return detail.ranked; // "combined" -- already sorted by combined score server-side
  }, [detail, sortMode]);

  const verticalGroups = useMemo(() => (detail && sortMode === "vertical" ? groupByVertical(detail.ranked) : []), [detail, sortMode]);

  const sortControl = (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-muted)" }}>
      Sort:
      <select
        value={sortMode}
        onChange={(e) => setSortMode(e.target.value as SortMode)}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          color: "var(--ink)",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "4px 8px",
          cursor: "pointer",
        }}
      >
        {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
          <option key={mode} value={mode}>
            {SORT_LABELS[mode]}
          </option>
        ))}
      </select>
    </label>
  );

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
          {sortMode === "vertical" ? (
            <section style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, margin: 0, color: "var(--ink)" }}>
                  All Companies
                </h2>
                {sortControl}
              </div>
              {verticalGroups.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--ink-muted)", fontStyle: "italic" }}>No companies have been scored yet.</p>
              )}
              {verticalGroups.map((group) => (
                <CompanyGrid
                  key={group.vertical}
                  title={group.vertical}
                  accent="var(--thesis)"
                  companies={group.companies}
                  emptyMessage=""
                  rank
                />
              ))}
            </section>
          ) : (
            <CompanyGrid
              title="All Companies"
              accent="var(--ink)"
              companies={filteredRanked}
              emptyMessage={sortMode === "combined" ? "No companies have been scored yet." : "No companies match this sort."}
              rank
              headerControls={sortControl}
            />
          )}
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
                Scout hasn&apos;t been able to look into these companies yet -- they&apos;re ingested but not scored.
              </p>
              <CompanyGrid title="Not yet evaluated" accent="var(--line)" companies={detail.unranked} emptyMessage="" />
            </details>
          )}
        </>
      )}
    </div>
  );
}
