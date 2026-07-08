import type { ReactNode } from "react";
import type { CompanyCompactDTO } from "../../lib/api/serialize";
import { CompanyCard } from "./CompanyCard";

interface CompanyGridProps {
  title: string;
  accent: string;
  companies: CompanyCompactDTO[];
  emptyMessage: string;
  /**
   * Companies arriving here are already sorted/filtered by the caller
   * (BatchDashboard applies the sort-mode control before passing
   * `companies` down) — this component just renders whatever order it's
   * given, plus the "#N" rank badge when `rank` is set. It doesn't
   * re-sort anything itself, since re-sorting here could silently drift
   * from whichever ordering the caller actually intends for the current
   * sort mode.
   */
  rank?: boolean;
  /** Rendered inline next to the title/count — e.g. the sort-mode dropdown. */
  headerControls?: ReactNode;
}

export function CompanyGrid({ title, accent, companies, emptyMessage, rank = false, headerControls }: CompanyGridProps) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: accent, flexShrink: 0 }} />
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 19,
              fontWeight: 600,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            {title}
          </h2>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-muted)" }}>{companies.length}</span>
        </div>
        {headerControls}
      </div>

      {rank && companies.length > 0 && (
        <p style={{ margin: "0 0 12px 18px", fontSize: 12, color: "var(--ink-muted)", fontStyle: "italic" }}>
          Ranked highest score first
        </p>
      )}
      {(!rank || companies.length === 0) && <div style={{ marginBottom: 12 }} />}

      {companies.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-muted)", fontStyle: "italic" }}>{emptyMessage}</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          {companies.map((c, i) =>
            rank ? (
              <div key={c.slug} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                <span
                  aria-hidden
                  title={`Rank ${i + 1} of ${companies.length}`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-muted)",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--line)",
                    borderRadius: 999,
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 14,
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CompanyCard company={c} />
                </div>
              </div>
            ) : (
              <CompanyCard key={c.slug} company={c} />
            )
          )}
        </div>
      )}
    </section>
  );
}
