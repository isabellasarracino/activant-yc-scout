"use client";

import type { BatchDTO } from "../../lib/api/serialize";

interface BatchSwitcherProps {
  batches: BatchDTO[];
  selectedBatchId: string;
  onChange: (batchId: string) => void;
}

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
        <option key={b.id} value={b.id}>
          {b.displayName} ({b.companyCount ?? "?"})
        </option>
      ))}
    </select>
  );
}
