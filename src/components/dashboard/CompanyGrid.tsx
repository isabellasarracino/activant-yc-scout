import type { CompanyCompactDTO } from "../../lib/api/serialize";
import { CompanyCard } from "./CompanyCard";

interface CompanyGridProps {
  title: string;
  accent: string;
  companies: CompanyCompactDTO[];
  emptyMessage: string;
  /**
   * Companies arriving here are already sorted descending by combined
   * score (team + thesis) — `rankCompaniesForDisplay`
   * (src/lib/db/repository.ts) does this server-side. `rank` just makes
   * that order visible on the page itself (a "#1" badge + a caption)
   * rather than leaving it implicit; it doesn't re-sort anything here,
   * since re-sorting client-side could silently drift from the server's
   * actual ordering logic.
   */
  rank?: boolean;
}

export function CompanyGrid({ title, accent, companies, emptyMessage, rank = false }: CompanyGridProps) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
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
          }}
        >
          {companies.map((c, i) =>
            rank ? (
              <div key={c.slug} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
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
