import { callForcedTool, MODELS } from "../ai/openrouter";
import { SCORE_TOOL, buildScoreResult, describeRubric, describeThesis } from "./scoreTool";
import { TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC } from "./rubric";
import type { RawScoreInput, ScoreResult } from "./types";
import type { NormalizedCompany } from "../yc/types";
import type { ThesisSnapshot } from "../thesis/types";

function buildPrompt(company: NormalizedCompany, thesis: ThesisSnapshot): string {
  const founderText = company.founders.length
    ? company.founders
        .map((f) => `- ${f.name}${f.title ? ` (${f.title})` : ""}: ${f.bio ?? "no bio available"}`)
        .join("\n")
    : "No founder bios available for this pass.";

  return `Score this Y Combinator company against both rubrics below. Ground every rationale in specifics from what's provided here — never generic boilerplate. If evidence for a dimension is genuinely absent, say so in the rationale and score conservatively (do not guess or invent evidence).

# Company
Name: ${company.name}
One-liner: ${company.oneLiner}
Description: ${company.longDescription || "(no long description provided)"}
Industry / tags: ${[...company.industries, ...company.tags].join(", ") || "none listed"}
Team size: ${company.teamSize}
Batch: ${company.batchDisplayName}
${company.founderExtractionNote ? `Note: ${company.founderExtractionNote}` : ""}

# Founders
${founderText}

# Rubric 1 — Team & General Interest
${describeRubric(TEAM_GENERAL_RUBRIC)}

# Rubric 2 — Activant Thesis Fit
${describeThesis(thesis)}

${describeRubric(THESIS_FIT_RUBRIC)}

Call record_score with a 0-10 score and rationale for every dimension listed above, plus a normalized primary_vertical label and the overall summary. Keep every rationale to 10 words or fewer (a fragment is fine, a full sentence is not) and the summary to exactly one sentence — brevity is a hard requirement, not a suggestion.`;
}

export interface TriageInput {
  company: NormalizedCompany;
  thesis: ThesisSnapshot;
}

/**
 * Fast pass: scores a company on both rubrics using only what ingestion
 * already gathered — YC's own description/tags plus founder bios from the
 * YC page. No external website fetch, no live web search. Meant to run for
 * every company in a batch cheaply enough that cost/latency isn't a
 * concern.
 *
 * The more expensive work — the company's own website — is reserved for
 * scoreDeepDive (deepDive.ts), which only runs on companies that clear a
 * bar here. See docs/ARCHITECTURE.md#scoring-design.
 */
export async function scoreTriage({ company, thesis }: TriageInput): Promise<ScoreResult> {
  let result;
  try {
    result = await callForcedTool({
      model: MODELS.scoring,
      maxTokens: 4096,
      userContent: buildPrompt(company, thesis),
      tool: SCORE_TOOL,
    });
  } catch (err) {
    throw new Error(
      `Scoring model did not return a record_score tool call for "${company.name}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (result.finishReason === "length") {
    throw new Error(
      `Scoring response for "${company.name}" was cut off at the token limit before finishing — the record_score call is likely incomplete/malformed. Consider raising max tokens if this recurs.`
    );
  }

  return buildScoreResult(result.input as RawScoreInput, "triage", thesis);
}
