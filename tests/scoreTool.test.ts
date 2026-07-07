import { describe, expect, it } from "vitest";
import { buildScoreResult, buildScoreTool, describeRubric, describeThesis } from "../src/lib/scoring/scoreTool";
import { TEAM_GENERAL_RUBRIC } from "../src/lib/scoring/rubric";
import { fullRawScore, sampleThesis } from "./fixtures/testData";

describe("buildScoreTool", () => {
  it("requires every dimension of both rubrics, so a partial score can never validate", () => {
    const tool = buildScoreTool();
    const props = tool.input_schema.properties as Record<string, { required: string[] }>;
    expect(props.team_general?.required).toEqual([
      "founder_market_fit",
      "founder_track_record",
      "team_completeness",
      "idea_quality",
      "execution_signal",
    ]);
    expect(props.thesis_fit?.required).toEqual([
      "sector_alignment",
      "business_model_fit",
      "research_alignment",
      "category_potential",
    ]);
  });
});

describe("describeRubric / describeThesis", () => {
  it("renders every dimension label", () => {
    const text = describeRubric(TEAM_GENERAL_RUBRIC);
    for (const dim of TEAM_GENERAL_RUBRIC.dimensions) {
      expect(text).toContain(dim.label);
    }
  });

  it("includes the thesis source and date so a reviewer can tell how fresh it was", () => {
    const text = describeThesis(sampleThesis);
    expect(text).toContain(sampleThesis.source);
    expect(text).toContain(sampleThesis.summary);
    expect(text).toContain("2026-07-01");
  });
});

describe("buildScoreResult", () => {
  it("is a pure function of its inputs — same raw score always produces the same composite/category", () => {
    const raw = fullRawScore();
    const a = buildScoreResult(raw, "triage", sampleThesis);
    const b = buildScoreResult(raw, "triage", sampleThesis);
    expect(a.teamGeneralScore).toBe(b.teamGeneralScore);
    expect(a.primaryCategory).toBe(b.primaryCategory);
  });

  it("tags the pass correctly for both triage and deep_dive", () => {
    const raw = fullRawScore();
    expect(buildScoreResult(raw, "triage", sampleThesis).pass).toBe("triage");
    expect(buildScoreResult(raw, "deep_dive", sampleThesis).pass).toBe("deep_dive");
  });

  it("throws a clear, diagnosable error rather than a generic crash when team_general is missing from the model's response", () => {
    // Real failure mode hit on the actual Summer 2026 batch run: a
    // malformed/incomplete record_score tool call crashed with
    // "Cannot convert undefined or null to object" deep inside
    // Object.entries. This should fail loudly and specifically instead.
    const raw = { ...fullRawScore(), team_general: undefined } as unknown as Parameters<typeof buildScoreResult>[0];
    expect(() => buildScoreResult(raw, "triage", sampleThesis)).toThrow(/team_general/);
  });

  it("throws a clear error when thesis_fit is missing", () => {
    const raw = { ...fullRawScore(), thesis_fit: undefined } as unknown as Parameters<typeof buildScoreResult>[0];
    expect(() => buildScoreResult(raw, "triage", sampleThesis)).toThrow(/thesis_fit/);
  });
});
