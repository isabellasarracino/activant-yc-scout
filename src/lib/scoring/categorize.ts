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
 * - Below `qualifyBar` on both axes: primaryCategory is null. The company
 *   is still stored and answerable via chat/search, it just doesn't
 *   surface in either headline list.
 * - Above the bar on exactly one axis: that's the primary category.
 * - Above the bar on both: the STRONGER axis is primary; `secondaryTag`
 *   records that it's also a genuine hit on the other axis, so the
 *   information isn't lost, without duplicating the card into both lists.
 * - Exact ties (both qualify, equal scores): thesis_fit wins by default —
 *   it's the more specific, more actionable signal for sourcing, and
 *   "interesting in general" is deliberately the lower bar of the two.
 *
 * `qualifyBar` defaults to 6.5 out of 10 as a starting point, not a
 * calibrated value — see docs/ARCHITECTURE.md#categorization for why this
 * should be revisited once there's real scored data to check it against
 * (e.g. "what fraction of a batch clears the bar" is a much better way to
 * tune this than picking a number before seeing any real scores).
 */
export function categorize(
  teamGeneralScore: number,
  thesisAlignScore: number,
  qualifyBar = 6.5
): CategorizationResult {
  const qualifiesTeam = teamGeneralScore >= qualifyBar;
  const qualifiesThesis = thesisAlignScore >= qualifyBar;

  if (!qualifiesTeam && !qualifiesThesis) {
    return { primaryCategory: null, secondaryTag: false };
  }
  if (qualifiesTeam && !qualifiesThesis) {
    return { primaryCategory: "team_general", secondaryTag: false };
  }
  if (qualifiesThesis && !qualifiesTeam) {
    return { primaryCategory: "thesis_fit", secondaryTag: false };
  }
  // Both qualify — stronger axis primary, other axis flagged not duplicated.
  if (teamGeneralScore > thesisAlignScore) {
    return { primaryCategory: "team_general", secondaryTag: true };
  }
  return { primaryCategory: "thesis_fit", secondaryTag: true }; // includes exact ties
}
