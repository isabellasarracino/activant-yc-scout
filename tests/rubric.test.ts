import { describe, expect, it } from "vitest";
import { compositeScore, TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC } from "../src/lib/scoring/rubric";

describe("compositeScore", () => {
  it("weights dimensions correctly for the team & general rubric", () => {
    // weights: founder_market_fit .25, founder_track_record .25, team_completeness .15,
    // idea_quality .20, execution_signal .15 — sums to 1.0
    const score = compositeScore(TEAM_GENERAL_RUBRIC, {
      founder_market_fit: 10,
      founder_track_record: 10,
      team_completeness: 0,
      idea_quality: 0,
      execution_signal: 0,
    });
    expect(score).toBe(5); // (10*.25 + 10*.25) = 5.0
  });

  it("every dimension at the same score returns that score (weights sum to 1)", () => {
    const flat = Object.fromEntries(TEAM_GENERAL_RUBRIC.dimensions.map((d) => [d.key, 7]));
    expect(compositeScore(TEAM_GENERAL_RUBRIC, flat)).toBe(7);

    const flatThesis = Object.fromEntries(THESIS_FIT_RUBRIC.dimensions.map((d) => [d.key, 4]));
    expect(compositeScore(THESIS_FIT_RUBRIC, flatThesis)).toBe(4);
  });

  it("rubric dimension weights sum to 1.0 (a drifting weight would silently skew every score)", () => {
    for (const rubric of [TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC]) {
      const total = rubric.dimensions.reduce((sum, d) => sum + d.weight, 0);
      expect(total).toBeCloseTo(1.0, 5);
    }
  });

  it("throws a specific, debuggable error when a dimension is missing rather than silently mis-scoring", () => {
    expect(() => compositeScore(TEAM_GENERAL_RUBRIC, { founder_market_fit: 8 })).toThrow(
      /Missing score for dimension "founder_track_record"/
    );
  });
});
