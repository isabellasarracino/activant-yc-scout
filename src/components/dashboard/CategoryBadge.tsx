import type { PrimaryCategory } from "../../lib/scoring/types";

const LABELS: Record<Exclude<PrimaryCategory, null>, string> = {
  team_general: "Team & General Interest",
  thesis_fit: "Activant Thesis Fit",
};

const COLORS: Record<Exclude<PrimaryCategory, null>, { fg: string; bg: string }> = {
  team_general: { fg: "var(--team)", bg: "var(--team-soft)" },
  thesis_fit: { fg: "var(--thesis)", bg: "var(--thesis-soft)" },
};

interface CategoryBadgeProps {
  category: PrimaryCategory;
  secondaryTag: boolean;
}

/**
 * `secondaryTag: true` means the company also genuinely clears the bar
 * on the *other* axis — surfaced here as a small "+ other axis" note
 * rather than a second badge, matching the product requirement that a
 * company is never listed in both categories even when it qualifies for
 * both.
 */
export function CategoryBadge({ category, secondaryTag }: CategoryBadgeProps) {
  if (category === null) {
    return (
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--ink-muted)",
          border: "1px solid var(--line)",
          borderRadius: 4,
          padding: "2px 8px",
          whiteSpace: "nowrap",
        }}
      >
        Unranked
      </span>
    );
  }

  const other: Exclude<PrimaryCategory, null> = category === "team_general" ? "thesis_fit" : "team_general";
  const { fg, bg } = COLORS[category];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          fontWeight: 600,
          color: fg,
          background: bg,
          borderRadius: 4,
          padding: "2px 8px",
          whiteSpace: "nowrap",
        }}
      >
        {LABELS[category]}
      </span>
      {secondaryTag && (
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--ink-muted)" }} title={`Also qualifies for ${LABELS[other]}`}>
          + {other === "team_general" ? "Team" : "Thesis"}
        </span>
      )}
    </span>
  );
}
