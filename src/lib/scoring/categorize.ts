import type { PrimaryCategory } from "./types";

export interface CategorizationResult {
  primaryCategory: PrimaryCategory;
  /** Genuinely strong on the *other* axis too — flagged, never a second listing. */
  secondaryTag: boolean;
}

/**
 * Decide a single primary bucket for a company from its two composite
 * scores. Every company gets exactly one category, never both — per the
 * product requirement, "if a company fits well in both categories, decide
 * that and don't just put it under both categories."
 *
 * Every *scored* company gets a real category — the stronger of the two
 * axes, with exact ties going to thesis_fit (the more specific, more
 * actionable signal for sourcing; "interesting in general" is
 * deliberately the lower bar of the two). There used to be a qualifying
 * bar below which a company got `primaryCategory: null` ("unranked",
 * shown but not in either headline list) — removed per explicit product
 * feedback once there was real scored data to look at: every company
 * should be visible, ranked, in one list or the other. `primaryCategory`
 * is still nullable in the type/schema for a company that hasn't been
 * *scored* at all yet (no score row) — that's a different state than
 * "scored but weak," and still renders separately (see
 * `rankCompaniesForDisplay` in src/lib/db/repository.ts).
 *
 * `secondaryTag` is a separate, still-meaningful threshold: it flags
 * whether the *non-primary* axis is independently strong on its own
 * (>= `secondaryTagBar`), so "also a genuine hit on the other axis"
 * doesn't become true for nearly everyone the way it would if it were
 * tied to the same comparison used to pick a winner.
 */
export function categorize(
  teamGeneralScore: number,
  thesisAlignScore: number,
  secondaryTagBar = 6.5
): CategorizationResult {
  const primaryCategory: Exclude<PrimaryCategory, null> =
    teamGeneralScore > thesisAlignScore ? "team_general" : "thesis_fit"; // exact ties -> thesis_fit

  const otherAxisScore = primaryCategory === "team_general" ? thesisAlignScore : teamGeneralScore;
  const secondaryTag = otherAxisScore >= secondaryTagBar;

  return { primaryCategory, secondaryTag };
}
