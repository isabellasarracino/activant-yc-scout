"use client";

import type { YcBatchInfo } from "../../lib/api/client";

interface BatchSwitcherProps {
  batches: YcBatchInfo[];
  selectedBatchId: string;
  onChange: (batchId: string) => void;
}

/**
 * Every batch from Summer 2026 onward (see EARLIEST_TRACKED_BATCH in
 * src/lib/yc/mirror.ts), not just ones we've already evaluated — a batch
 * that YC has just announced still shows up here, labeled "not yet
 * evaluated", so there's somewhere to select it before choosing to
 * evaluate it (see BatchDashboard.tsx).
 */
export function BatchSwitcher({ batches, selectedBatchId, onChange }: BatchSwitcherProps) {
  return (
    <select
      value={selectedBatchId}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Select batch"
      style={{
        fontFamily: "var(--font-body)",
        fontSize: 13,
        fontWeight: 500,
        color: "var(--ink)",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "6px 10px",
        cursor: "pointer",
      }}
    >
      {batches.map((b) => (
        <option key={b.slug} value={b.slug}>
          {optionLabel(b)}
        </option>
      ))}
    </select>
  );
}

function optionLabel(b: YcBatchInfo): string {
  if (!b.alreadyEvaluated) return `${b.displayName} — not yet evaluated`;
  if (b.hasNewCompanies) return `${b.displayName} (${b.ourCompanyCount}, ${b.mirrorCompanyCount - b.ourCompanyCount} new)`;
  return `${b.displayName} (${b.ourCompanyCount})`;
}
