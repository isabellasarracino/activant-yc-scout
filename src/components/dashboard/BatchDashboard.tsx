"use client";

import { useEffect, useState } from "react";
import type { BatchDTO } from "../../lib/api/serialize";
import { fetchBatchDetail, fetchBatches, ApiError, type BatchDetailResponse } from "../../lib/api/client";
import { BatchSwitcher } from "./BatchSwitcher";
import { CompanyGrid } from "./CompanyGrid";

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
  if (/ANTHROPIC_API_KEY|api key/i.test(message)) {
    return `This app isn't connected to Claude yet. (${message})`;
  }
  return message;
}

/**
 * Home page's main content. Defaults to the most recently synced batch —
 * `GET /api/batches` already comes back ordered newest-first
 * (`listBatchesFromDb`'s `orderBy: lastSyncedAt desc`), so "the batch
 * that's currently in progress" is just index 0, no separate "latest"
 * endpoint needed. Switching batches re-fetches detail client-side;
 * there's no separate "history" mode (docs/ARCHITECTURE.md#chat--qa
 * makes the same point for chat) — an old batch renders exactly the same
 * way a new one does.
 */
export function BatchDashboard() {
  const [batchesState, setBatchesState] = useState<LoadState>("loading");
  const [batches, setBatches] = useState<BatchDTO[]>([]);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<BatchDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBatches()
      .then((list) => {
        if (cancelled) return;
        setBatches(list);
        setBatchesState("ready");
        if (list.length > 0) setSelectedBatchId(list[0]!.id);
      })
      .catch((err) => {
        if (cancelled) return;
        setBatchesError(friendlyError(err instanceof ApiError ? err.message : "Couldn't load batches."));
        setBatchesState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (batchesState === "loading") {
    return <p style={{ color: "var(--ink-muted)", fontSize: 14 }}>Loading batches…</p>;
  }

  if (batchesState === "error") {
    return <p style={{ color: "var(--danger)", fontSize: 14 }}>{batchesError}</p>;
  }

  if (batches.length === 0) {
    return (
      <div style={{ maxWidth: 480 }}>
        <p style={{ fontSize: 14, color: "var(--ink)" }}>No batches ingested yet.</p>
        <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>
          Run the pipeline once a database and Anthropic API key are configured:
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
    );
  }

  return (
    <div>
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
            title="Activant Thesis Fit"
            accent="var(--thesis)"
            companies={detail.thesisFit}
            emptyMessage="No companies have qualified on thesis fit yet."
            rank
          />
          <CompanyGrid
            title="Team & General Interest"
            accent="var(--team)"
            companies={detail.teamGeneral}
            emptyMessage="No companies have qualified on team/general interest yet."
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
                {detail.unranked.length} unranked (below the qualifying bar on both axes)
              </summary>
              <CompanyGrid title="Unranked" accent="var(--line)" companies={detail.unranked} emptyMessage="" />
            </details>
          )}
        </>
      )}
    </div>
  );
}
