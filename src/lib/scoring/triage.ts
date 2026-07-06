import Anthropic from "@anthropic-ai/sdk";
import { SCORE_TOOL, buildScoreResult, describeRubric, describeThesis } from "./scoreTool";
import { TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC } from "./rubric";
import type { RawScoreInput, ScoreResult } from "./types";
import type { NormalizedCompany } from "../yc/types";
import type { ThesisSnapshot } from "../thesis/types";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/** Evaluative task, not a structuring one — worth the better model. */
const SCORING_MODEL = "claude-sonnet-5";

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

Call record_score with a 0-10 score and a grounded rationale for every dimension listed above, plus the overall summary.`;
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
 * The more expensive work — the company's own website, supplementary
 * founder research via web search — is reserved for scoreDeepDive
 * (deepDive.ts), which only runs on companies that clear a bar here or
 * that a user asks about directly. See docs/ARCHITECTURE.md#scoring-design.
 */
export async function scoreTriage({ company, thesis }: TriageInput): Promise<ScoreResult> {
  const msg = await client().messages.create({
    model: SCORING_MODEL,
    max_tokens: 4096,
    tools: [SCORE_TOOL],
    tool_choice: { type: "tool", name: "record_score" },
    messages: [{ role: "user", content: buildPrompt(company, thesis) }],
  });

  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) {
    throw new Error(`Scoring model did not return a record_score tool call for "${company.name}"`);
  }
  if (msg.stop_reason === "max_tokens") {
    throw new Error(
      `Scoring response for "${company.name}" was cut off at the token limit (max_tokens) before finishing — the record_score call is likely incomplete/malformed. Consider raising max_tokens if this recurs.`
    );
  }

  return buildScoreResult(toolUse.input as RawScoreInput, "triage", thesis);
}
