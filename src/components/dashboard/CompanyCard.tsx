"use client";

import { useState } from "react";
import type { CompanyCompactDTO, CompanyFullDTO } from "../../lib/api/serialize";
import { fetchCompanyDetail, ApiError } from "../../lib/api/client";
import { ScoreBars } from "./ScoreBars";
import { CategoryBadge } from "./CategoryBadge";
import { formatScore } from "../../lib/scoring/format";

interface CompanyCardProps {
  company: CompanyCompactDTO;
}

/**
 * Compact by default, full per-dimension detail on click — the product
 * requirement, and the same "collapsed score, expand for the full
 * scorecard" pattern Activant's own Phase II IC memos use (see
 * docs/ARCHITECTURE.md#rubric-transparency). Full detail is fetched lazily
 * from GET /api/companies/[slug] the first time a card is expanded, then
 * cached in local state — a batch page never pays for founder bios /
 * rationales it never asks to see.
 */
export function CompanyCard({ company }: CompanyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<CompanyFullDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setError(null);
      try {
        const full = await fetchCompanyDetail(company.slug);
        setDetail(full);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't load full detail for this company.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <article
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        onClick={handleToggle}
        aria-expanded={expanded}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flex: expanded ? "0 0 auto" : "1 1 auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 17,
                fontWeight: 600,
                margin: 0,
                color: "var(--ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={company.name}
            >
              {company.name}
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "var(--ink-muted)",
                minHeight: "2.6em",
                lineHeight: 1.3,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={company.oneLiner}
            >
              {company.oneLiner}
            </p>
          </div>
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              color: "var(--ink-muted)",
              transform: expanded ? "rotate(90deg)" : "none",
              transition: "transform 120ms ease",
              lineHeight: 1,
              marginTop: 4,
            }}
          >
            ›
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: "auto" }}>
          <CategoryBadge category={company.primaryCategory} secondaryTag={company.secondaryTag} />
          <ScoreBars
            teamGeneralScore={company.teamGeneralScore}
            thesisAlignScore={company.thesisAlignScore}
            primaryCategory={company.primaryCategory}
          />
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "14px 16px", background: "var(--surface-sunken)" }}>
          {loading && <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>Loading full detail…</p>}
          {error && <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>}
          {detail && <CompanyFullDetail detail={detail} />}
        </div>
      )}
    </article>
  );
}

function CompanyFullDetail({ detail }: { detail: CompanyFullDTO }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {detail.summary && <p style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "var(--ink)" }}>{detail.summary}</p>}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", fontSize: 12, color: "var(--ink-muted)" }}>
        {detail.website && (
          <a
            href={detail.website}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 14, fontWeight: 700, color: "var(--team)", textDecoration: "underline" }}
          >
            {detail.website.replace(/^https?:\/\//, "")}
          </a>
        )}
        <a
          href={detail.ycUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 14, fontWeight: 700, color: "var(--team)", textDecoration: "underline" }}
        >
          YC profile
        </a>
        {detail.teamSize !== null && <span>{detail.teamSize} team members</span>}
        {detail.pass && <span>{detail.pass === "deep_dive" ? "Deep-dive scored" : "Triage scored"}</span>}
        {detail.websiteAccessible === false && (
          <span style={{ color: "var(--danger)" }}>Site unreachable{detail.websiteCheckNote ? ` — ${detail.websiteCheckNote}` : ""}</span>
        )}
      </div>

      {detail.founders.length > 0 && (
        <section>
          <SectionLabel>Founders</SectionLabel>
          <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {detail.founders.map((f) => (
              <li key={f.name} style={{ fontSize: 13 }}>
                <strong>{f.name}</strong>
                {f.title ? ` — ${f.title}` : ""}
                {f.bio && <div style={{ color: "var(--ink-muted)", marginTop: 2 }}>{f.bio}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.rubricBreakdown ? (
        <>
          <RubricSection title="Team & General Interest" dimensions={detail.rubricBreakdown.team_general} accent="var(--team)" />
          <RubricSection title="Activant Thesis Fit" dimensions={detail.rubricBreakdown.thesis_fit} accent="var(--thesis)" />
        </>
      ) : (
        <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>Not scored yet.</p>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h4
      style={{
        margin: 0,
        fontFamily: "var(--font-body)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--ink-muted)",
      }}
    >
      {children}
    </h4>
  );
}

function RubricSection({
  title,
  dimensions,
  accent,
}: {
  title: string;
  dimensions: Array<{ dimension: string; label: string; score: number; rationale: string }>;
  accent: string;
}) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {dimensions.map((d) => (
          <div key={d.dimension} style={{ display: "flex", gap: 10 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 600,
                color: accent,
                width: 44,
                flexShrink: 0,
              }}
            >
              {formatScore(d.score)}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 2 }}>{d.rationale}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
