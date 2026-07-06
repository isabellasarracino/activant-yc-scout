import Anthropic from "@anthropic-ai/sdk";
import { categorize } from "./categorize";
import { TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC, compositeScore, type Rubric } from "./rubric";
import type { RawScoreInput, ScoreResult } from "./types";
import type { ThesisSnapshot } from "../thesis/types";

function dimensionSchema(rubric: Rubric) {
  return {
    type: "object" as const,
    properties: Object.fromEntries(
      rubric.dimensions.map((d) => [
        d.key,
        {
          type: "object",
          properties: {
            score: { type: "number", description: `0-10. ${d.description}` },
            rationale: {
              type: "string",
              description:
                "1-3 sentences, grounded in specific evidence from what was provided. No generic filler — if evidence is thin, say so. Paraphrase findings in your own words rather than quoting sources at length; name where a specific claim came from (e.g. 'per the company's site' or 'per a 2026 TechCrunch piece') so it's checkable.",
            },
          },
          required: ["score", "rationale"],
        },
      ])
    ),
    required: rubric.dimensions.map((d) => d.key),
  };
}

/** One tool definition built from both rubrics, so triage and deep-dive can never silently drift apart. */
export function buildScoreTool(): Anthropic.Tool {
  return {
    name: "record_score",
    description: "Record dimension-by-dimension scores for both evaluation criteria, plus a short overall summary.",
    input_schema: {
      type: "object",
      properties: {
        team_general: dimensionSchema(TEAM_GENERAL_RUBRIC),
        thesis_fit: dimensionSchema(THESIS_FIT_RUBRIC),
        summary: {
          type: "string",
          description: "2-3 sentence overall take, naming the single strongest and single weakest point.",
        },
      },
      required: ["team_general", "thesis_fit", "summary"],
    },
  };
}

export const SCORE_TOOL = buildScoreTool();

export function describeRubric(rubric: Rubric): string {
  return rubric.dimensions.map((d) => `- ${d.label}: ${d.description}`).join("\n");
}

export function describeThesis(thesis: ThesisSnapshot): string {
  return `Current thesis (source: ${thesis.source}, as of ${thesis.fetchedAt.toISOString().slice(0, 10)}):\n"""\n${thesis.summary}\n"""`;
}

/** Turns the model's raw record_score input into composite scores + categorization. Shared by every pass. */
export function buildScoreResult(raw: RawScoreInput, pass: "triage" | "deep_dive", thesis: ThesisSnapshot): ScoreResult {
  const teamScores = Object.fromEntries(Object.entries(raw.team_general).map(([k, v]) => [k, v.score]));
  const thesisScores = Object.fromEntries(Object.entries(raw.thesis_fit).map(([k, v]) => [k, v.score]));

  const teamGeneralScore = compositeScore(TEAM_GENERAL_RUBRIC, teamScores);
  const thesisAlignScore = compositeScore(THESIS_FIT_RUBRIC, thesisScores);
  const { primaryCategory, secondaryTag } = categorize(teamGeneralScore, thesisAlignScore);

  return {
    pass,
    teamGeneralScore,
    thesisAlignScore,
    primaryCategory,
    secondaryTag,
    summary: raw.summary,
    rubricBreakdown: {
      team_general: TEAM_GENERAL_RUBRIC.dimensions.map((d) => ({
        dimension: d.key,
        label: d.label,
        score: raw.team_general[d.key]?.score ?? Number.NaN,
        rationale: raw.team_general[d.key]?.rationale ?? "",
      })),
      thesis_fit: THESIS_FIT_RUBRIC.dimensions.map((d) => ({
        dimension: d.key,
        label: d.label,
        score: raw.thesis_fit[d.key]?.score ?? Number.NaN,
        rationale: raw.thesis_fit[d.key]?.rationale ?? "",
      })),
    },
    thesisVersionSource: thesis.source,
    thesisFetchedAt: thesis.fetchedAt,
  };
}
