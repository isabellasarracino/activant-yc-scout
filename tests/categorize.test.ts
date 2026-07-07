import { describe, expect, it } from "vitest";
import { categorize } from "../src/lib/scoring/categorize";

describe("categorize", () => {
  it("assigns team_general when the team score is higher, even if both scores are low", () => {
    // No company is left unranked, per explicit product feedback — see
    // categorize.ts's docstring for the "removed the qualifying bar" story.
    expect(categorize(4, 3)).toEqual({ primaryCategory: "team_general", secondaryTag: false });
  });

  it("assigns team_general when the team score is clearly higher", () => {
    expect(categorize(8, 3)).toEqual({ primaryCategory: "team_general", secondaryTag: false });
  });

  it("assigns thesis_fit when the thesis score is clearly higher", () => {
    expect(categorize(3, 8)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: false });
  });

  it("when both scores clear the secondary-tag bar, the stronger axis is primary and the other is a flag, not a second listing", () => {
    expect(categorize(9, 7)).toEqual({ primaryCategory: "team_general", secondaryTag: true });
    expect(categorize(7, 9)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: true });
  });

  it("breaks an exact tie toward thesis_fit by design", () => {
    expect(categorize(8, 8)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: true });
  });

  it("breaks an exact tie toward thesis_fit even at very low scores — always categorized, never null", () => {
    expect(categorize(2, 2)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: false });
  });

  it("always returns exactly one primary category — never both, never null, for any scored company", () => {
    const result = categorize(9.5, 6.6);
    expect(["team_general", "thesis_fit"]).toContain(result.primaryCategory);
    expect(result.primaryCategory).not.toBeNull();
  });

  it("does NOT set secondaryTag just because the primary axis won — only when the other axis independently clears its own bar", () => {
    // team wins (8 > 3), but 3 is nowhere near strong enough to also flag thesis fit.
    expect(categorize(8, 3)).toEqual({ primaryCategory: "team_general", secondaryTag: false });
  });

  it("respects a custom secondary-tag bar", () => {
    expect(categorize(5, 5, /* secondaryTagBar */ 4)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: true });
    expect(categorize(5, 5, /* secondaryTagBar */ 6)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: false });
  });

  it("treats a score exactly at the secondary-tag bar as qualifying (inclusive boundary)", () => {
    expect(categorize(9, 6.5)).toEqual({ primaryCategory: "team_general", secondaryTag: true });
  });
});
