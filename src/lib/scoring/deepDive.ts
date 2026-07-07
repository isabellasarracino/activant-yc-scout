import { callForcedTool, MODELS } from "../ai/openrouter";
import { SCORE_TOOL, buildScoreResult, describeRubric, describeThesis } from "./scoreTool";
import { TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC } from "./rubric";
import type { RawScoreInput } from "./types";
import type { NormalizedCompany } from "../yc/types";
import { fetchCompanyWebsite } from "../yc/companyWebsite";
import type { ThesisSnapshot } from "../thesis/types";
import type { ScoreResult } from "./types";

export interface DeepDiveInput {
  company: NormalizedCompany;
  thesis: ThesisSnapshot;
}

export interface DeepDiveResult extends ScoreResult {
  websiteAccessible: boolean;
  websiteCheckNote?: string;
}

function buildDeepDivePrompt(
  company: NormalizedCompany,
  thesis: ThesisSnapshot,
  websiteContent: string | undefined,
  websiteNote: string | undefined
): string {
  const founderText = company.founders.length
    ? company.founders
        .map((f) => `- ${f.name}${f.title ? ` (${f.title})` : ""}: ${f.bio ?? "no bio available"}${f.linkedinUrl ? ` [LinkedIn: ${f.linkedinUrl}]` : ""}`)
        .join("\n")
    : "No founder bios available.";

  const websiteSection = websiteContent
    ? `# Company website (${company.website})\n${websiteContent}`
    : `# Company website\n${websiteNote ?? "No website listed."}`;

  return `Score this Y Combinator company against both rubrics below. This is a deep-dive pass — you have the company's own website content below in addition to what a first pass would see. Ground every rationale in specifics; paraphrase rather than quote at length. If evidence for a dimension is genuinely absent, say so and score conservatively rather than guessing.

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

${websiteSection}

# Rubric 1 — Team & General Interest
${describeRubric(TEAM_GENERAL_RUBRIC)}

# Rubric 2 — Activant Thesis Fit
${describeThesis(thesis)}

${describeRubric(THESIS_FIT_RUBRIC)}`;
}

/**
 * Full pass: adds the company's own website content to what the triage
 * pass already had.
 *
 * Used to also include a live web-search tool and run as a multi-turn
 * agentic loop (the model could search, then decide to search again,
 * before finally calling record_score). That depended on Anthropic's
 * server-side web_search tool, which has no equivalent on OpenRouter —
 * dropped entirely, per explicit product decision, rather than replicated
 * with custom search-API plumbing, when this project switched providers.
 * See docs/ARCHITECTURE.md#model-provider. This makes deep-dive
 * structurally identical to triage (one forced record_score call) with
 * richer input, not a different call shape — the multi-turn loop, its
 * turn cap, and its search-use cap are all gone, not just unused.
 */
export async function scoreDeepDive({ company, thesis }: DeepDiveInput): Promise<DeepDiveResult> {
  const website = company.website ? await fetchCompanyWebsite(company.website) : null;
  const websiteAccessible = website?.accessible ?? false;
  const websiteCheckNote = company.website
    ? website?.note
    : "No website listed on the company's YC page.";

  let result;
  try {
    result = await callForcedTool({
      model: MODELS.scoring,
      maxTokens: 4096,
      userContent: buildDeepDivePrompt(company, thesis, website?.content, websiteCheckNote),
      tool: SCORE_TOOL,
    });
  } catch (err) {
    throw new Error(
      `Deep-dive scoring model did not return a record_score tool call for "${company.name}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (result.finishReason === "length") {
    throw new Error(
      `Deep-dive scoring response for "${company.name}" was cut off at the token limit before finishing — the record_score call is likely incomplete/malformed. Consider raising max tokens if this recurs.`
    );
  }

  const base = buildScoreResult(result.input as RawScoreInput, "deep_dive", thesis);
  return { ...base, websiteAccessible, websiteCheckNote };
}
