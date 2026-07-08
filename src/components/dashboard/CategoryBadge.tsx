import type { PrimaryCategory } from "../../lib/scoring/types";

/** Full official names — kept as a tooltip so the short on-card label doesn't lose them entirely. */
const FULL_LABELS: Record<Exclude<PrimaryCategory, null>, string> = {
  team_general: "Team & General Interest",
  thesis_fit: "Activant Thesis Fit",
};

/**
 * Short labels shown on the card itself. The original full names
 * ("Team & General Interest" / "Activant Thesis Fit") differ enough in
 * length that they'd wrap differently depending on which category a
 * card landed in, making otherwise-identical cards render at different
 * heights in the grid — fixed by shortening both to a similar, small
 * length, per direct user request ("the flag needs to be made smaller
 * so that all of the cards on the website are the same size").
 */
const SHORT_LABELS: Record<Exclude<PrimaryCategory, null>, string> = {
  team_general: "Team & General",
  thesis_fit: "Thesis Fit",
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
          fontSize: 10,
          fontWeight: 500,
          color: "var(--ink-muted)",
          border: "1px solid var(--line)",
          borderRadius: 4,
          padding: "1px 6px",
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        title={FULL_LABELS[category]}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 10,
          fontWeight: 600,
          color: fg,
          background: bg,
          borderRadius: 4,
          padding: "1px 6px",
          whiteSpace: "nowrap",
        }}
      >
        {SHORT_LABELS[category]}
      </span>
      {secondaryTag && (
        <span
          style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--ink-muted)" }}
          title={`Also qualifies for ${FULL_LABELS[other]}`}
        >
          + {other === "team_general" ? "Team" : "Thesis"}
        </span>
      )}
    </span>
  );
}
