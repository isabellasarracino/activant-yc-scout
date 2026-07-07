"use client";

import { useState } from "react";
import { evaluateBatch, ApiError } from "../../lib/api/client";

interface EvaluateBatchBannerProps {
  displayName: string;
  companyCount: number;
  onStarted: () => void;
}

/**
 * Shown when the mirror reports a newer YC batch than anything in our own
 * database — see GET /api/yc/latest-batch. Clicking the button asks
 * GitHub Actions to run the scoring pipeline (POST /api/batches/evaluate
 * -> src/lib/github/dispatch.ts), since scoring a whole batch takes far
 * longer than this website is allowed to keep a request open. See
 * docs/ARCHITECTURE.md#website-triggered-evaluation.
 */
export function EvaluateBatchBanner({ displayName, companyCount, onStarted }: EvaluateBatchBannerProps) {
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
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
          {displayName} just dropped — {companyCount} compan{companyCount === 1 ? "y" : "ies"} so far
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-muted)" }}>Scout hasn&apos;t looked at this batch yet.</p>
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
