import { describe, expect, it } from "vitest";
import { categorize } from "../src/lib/scoring/categorize";

describe("categorize", () => {
  it("returns null for both when neither score clears the bar", () => {
    expect(categorize(4, 3)).toEqual({ primaryCategory: null, secondaryTag: false });
  });

  it("assigns team_general when only the team score clears the bar", () => {
    expect(categorize(8, 3)).toEqual({ primaryCategory: "team_general", secondaryTag: false });
  });

  it("assigns thesis_fit when only the thesis score clears the bar", () => {
    expect(categorize(3, 8)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: false });
  });

  it("when both clear the bar, the stronger axis is primary and the other is a flag, not a second listing", () => {
    expect(categorize(9, 7)).toEqual({ primaryCategory: "team_general", secondaryTag: true });
    expect(categorize(7, 9)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: true });
  });

  it("breaks an exact tie (both qualifying) toward thesis_fit by design", () => {
    expect(categorize(8, 8)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: true });
  });

  it("always returns exactly one primary category (or null) — never a way to represent 'both'", () => {
    const result = categorize(9.5, 6.6);
    expect(["team_general", "thesis_fit", null]).toContain(result.primaryCategory);
  });

  it("respects a custom qualifying bar", () => {
    expect(categorize(5, 5, /* qualifyBar */ 4)).toEqual({ primaryCategory: "thesis_fit", secondaryTag: true });
    expect(categorize(5, 5, /* qualifyBar */ 6)).toEqual({ primaryCategory: null, secondaryTag: false });
  });

  it("treats a score exactly at the bar as qualifying (inclusive boundary)", () => {
    expect(categorize(6.5, 0)).toEqual({ primaryCategory: "team_general", secondaryTag: false });
  });
});
