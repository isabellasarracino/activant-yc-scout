import type { PrimaryCategory } from "./types";

export interface CategorizationResult {
  primaryCategory: PrimaryCategory;
  /** Genuinely strong on the *other* axis too — flagged, never a second listing. */
  secondaryTag: boolean;
}

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