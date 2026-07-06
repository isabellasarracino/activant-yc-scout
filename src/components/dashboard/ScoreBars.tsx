/**
 * The one deliberately memorable visual in this UI (per the frontend
 * design process: spend boldness in one place, keep everything else
 * quiet). Two horizontal bars, one per rubric axis, always shown
 * together regardless of which is "primary" — so an analyst scanning a
 * grid of cards can see the *shape* of both scores at a glance, not just
 * a single collapsed number. The primary axis (whichever qualified the
 * company for its category) renders filled/solid; the other renders as
 * a lighter outline — encoding "this is what got it here" structurally,
 * not just decoratively.
 */
import type { PrimaryCategory } from "../../lib/scoring/types";

interface ScoreBarsProps {
  teamGeneralScore: number | null;
  thesisAlignScore: number | null;
  primaryCategory: PrimaryCategory;
}

function Bar({
  label,
  score,
  color,
  softColor,
  emphasized,
}: {
  label: string;
  score: number | null;
  color: string;
  softColor: string;
  emphasized: boolean;
}) {
  const pct = score === null ? 0 : Math.max(0, Math.min(100, (score / 10) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--ink-muted)",
          width: 30,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: softColor,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            opacity: emphasized ? 1 : 0.45,
            borderRadius: 3,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: emphasized ? 600 : 400,
          color: score === null ? "var(--ink-muted)" : "var(--ink)",
          width: 28,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {score === null ? "—" : score.toFixed(1)}
      </span>
    </div>
  );
}

export function ScoreBars({ teamGeneralScore, thesisAlignScore, primaryCategory }: ScoreBarsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
      <Bar
        label="Team"
        score={teamGeneralScore}
        color="var(--team)"
        softColor="var(--team-soft)"
        emphasized={primaryCategory === "team_general"}
      />
      <Bar
        label="Thesis"
        score={thesisAlignScore}
        color="var(--thesis)"
        softColor="var(--thesis-soft)"
        emphasized={primaryCategory === "thesis_fit"}
      />
    </div>
  );
}
