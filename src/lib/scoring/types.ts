export interface DimensionScore {
  dimension: string;
  label: string;
  score: number;
  rationale: string;
}

export type PrimaryCategory = "team_general" | "thesis_fit" | null;

export interface ScoreResult {
  pass: "triage" | "deep_dive";
  teamGeneralScore: number;
  thesisAlignScore: number;
  primaryCategory: PrimaryCategory;
  secondaryTag: boolean;
  summary: string;
  rubricBreakdown: {
    team_general: DimensionScore[];
    thesis_fit: DimensionScore[];
  };
  thesisVersionSource: string;
  thesisFetchedAt: Date;
}

/** Raw shape returned by the model's record_score tool call, before composite scoring. */
export interface RawScoreInput {
  team_general: Record<string, { score: number; rationale: string }>;
  thesis_fit: Record<string, { score: number; rationale: string }>;
  summary: string;
}
