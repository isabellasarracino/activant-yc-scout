"use client";

import { useState } from "react";
import { evaluateBatch, ApiError } from "../../lib/api/client";

interface EvaluateBatchBannerProps {
  displayName: string;
  /** How many companies would actually get scored by clicking the button — the full mirror count for a first-time evaluation, or just the new ones for a refresh. */
  newCompanyCount: number;
  /** true = never evaluated at all; false = already evaluated, this many are new since last time. */
  isFirstEvaluation: boolean;
  onStarted: () => void;
}

/**
 * Shown for any batch (Summer 2026 onward — see GET /api/yc/batches) that
 * either hasn't been evaluated at all, or has grown since it was last
 * evaluated. Works the same way either way: clicking the button asks
 * GitHub Actions to run the scoring pipeline
 * (POST /api/batches/evaluate -> src/lib/github/dispatch.ts), since
 * scoring a batch takes far longer than this website is allowed to keep
 * a request open, and the pipeline itself only ever scores companies it
 * hasn't seen before (see docs/ARCHITECTURE.md#scoring-design) — so
 * re-clicking this for an already-evaluated batch is cheap and safe, not
 * a full re-score.
 */
export function EvaluateBatchBanner({ displayName, newCompanyCount, isFirstEvaluation, onStarted }: EvaluateBatchBannerProps) {
  const [state, setState] = useState<"idle" | "starting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setState("starting");
    setError(null);
    try {
      await evaluateBatch(displayName);
      onStarted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start evaluation.");
      setState("error");
    }
  }

  const companyWord = newCompanyCount === 1 ? "company" : "companies";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        background: "var(--thesis-soft)",
        border: "1px solid var(--thesis)",
        borderRadius: 8,
        padding: "14px 16px",
        marginBottom: 24,
      }}
    >
      <div>
        {isFirstEvaluation ? (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {displayName} — {newCompanyCount} {companyWord} so far
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-muted)" }}>Scout hasn&apos;t looked at this batch yet.</p>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {displayName} has {newCompanyCount} new {companyWord}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-muted)" }}>Since Scout last checked this batch.</p>
          </>
        )}
        {error && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--danger)" }}>{error}</p>}
      </div>
      <button
        onClick={handleClick}
        disabled={state === "starting"}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: 600,
          padding: "8px 16px",
          border: "none",
          borderRadius: 6,
          background: state === "starting" ? "var(--surface-sunken)" : "var(--ink)",
          color: state === "starting" ? "var(--ink-muted)" : "var(--surface)",
          cursor: state === "starting" ? "default" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {state === "starting" ? "Starting…" : "Evaluate this batch"}
      </button>
    </div>
  );
}
