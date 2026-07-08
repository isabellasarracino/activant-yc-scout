import { categorize } from "./categorize";
import { TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC, compositeScore, type Rubric } from "./rubric";
import type { RawScoreInput, ScoreResult } from "./types";
import type { ThesisSnapshot } from "../thesis/types";
import type { ToolDef } from "../ai/openrouter";

/**
 * Fixed, broad vertical vocabulary the model must choose from for
 * `primary_vertical` — deliberately a short, coarse-grained list (not
 * free text) so companies actually cluster together on the dashboard's
 * "sort by vertical" view instead of fragmenting into one-off, near-
 * duplicate labels ("Fintech" vs "Financial Infrastructure" vs "Neobank
 * Tech" all meaning basically the same thing). Broadly mirrors
 * Activant's own thesis verticals (see docs/thesis/current.md) plus a
 * few common YC categories outside Activant's thesis and a catch-all
 * "Other" — every company gets *some* bucket, never a blank/invented one.
 * Exported so the dashboard sort control and any future validation can
 * reference the same canonical list rather than duplicating it.
 */
export const VERTICAL_OPTIONS = [
  "Fintech & Payments",
  "Commerce Infrastructure",
  "Supply Chain & Logistics",
  "Insurance",
  "Healthcare Infrastructure",
  "Vertical SaaS",
  "Developer Tools & Infrastructure",
  "Consumer & Marketplaces",
  "Climate & Energy",
  "Other",
] as const;

export type VerticalOption = (typeof VERTICAL_OPTIONS)[number];

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
                "10 words or fewer. A fragment, not a full sentence — e.g. 'Ex-Stripe eng, no fintech GTM hire yet.' Grounded in one specific, checkable fact; no filler, no hedging language. If evidence is genuinely absent, write 'No evidence available' and score conservatively.",
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
export function buildScoreTool(): ToolDef {
  return {
    name: "record_score",
    description: "Record dimension-by-dimension scores for both evaluation criteria, plus a vertical from the fixed list and a short overall summary.",
    input_schema: {
      type: "object",
      properties: {
        team_general: dimensionSchema(TEAM_GENERAL_RUBRIC),
        thesis_fit: dimensionSchema(THESIS_FIT_RUBRIC),
        primary_vertical: {
          type: "string",
          enum: [...VERTICAL_OPTIONS],
          description:
            `Pick exactly one value from this fixed list — do not invent a new label, do not combine two, do not copy the company's raw YC tags verbatim: ${VERTICAL_OPTIONS.join(", ")}. These are deliberately broad so companies cluster together; if a company could plausibly fit two, pick whichever is the closer match. Use "Other" only when truly none of the rest fit.`,
        },
        summary: {
          type: "string",
          description:
            "Exactly one sentence — the single most important overall takeaway. No more than one sentence, no matter how much there is to say.",
        },
      },
      required: ["team_general", "thesis_fit", "primary_vertical", "summary"],
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
  if (!raw || typeof raw !== "object" || !raw.team_general || !raw.thesis_fit) {
    throw new Error(
      `record_score input is missing "team_general" and/or "thesis_fit" — the model's tool call was likely incomplete or malformed. Raw input: ${JSON.stringify(raw)}`
    );
  }

  const teamScores = Object.fromEntries(Object.entries(raw.team_general).map(([k, v]) => [k, v.score]));
  const thesisScores = Object.fromEntries(Object.entries(raw.thesis_fit).map(([k, v]) => [k, v.score]));

  const teamGeneralScore = compositeScore(TEAM_GENERAL_RUBRIC, teamScores);
  const thesisAlignScore = compositeScore(THESIS_FIT_RUBRIC, thesisScores);
  const { primaryCategory, secondaryTag } = categorize(teamGeneralScore, thesisAlignScore);

  // Defensive fallback: if the model ever returns something outside the
  // fixed list despite the enum constraint (a malformed/older client,
  // a model that ignores enum hints), don't let a stray label silently
  // create a new one-off vertical bucket on the dashboard — file it
  // under "Other" instead of trusting raw output here.
  const rawVertical = raw.primary_vertical;
  const primaryVertical: string = (VERTICAL_OPTIONS as readonly string[]).includes(rawVertical) ? rawVertical : "Other";

  return {
    pass,
    teamGeneralScore,
    thesisAlignScore,
    primaryCategory,
    secondaryTag,
    primaryVertical,
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
