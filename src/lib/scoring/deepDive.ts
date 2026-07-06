import Anthropic from "@anthropic-ai/sdk";
import { SCORE_TOOL, buildScoreResult, describeRubric, describeThesis } from "./scoreTool";
import { TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC } from "./rubric";
import type { RawScoreInput } from "./types";
import type { NormalizedCompany } from "../yc/types";
import { fetchCompanyWebsite } from "../yc/companyWebsite";
import type { ThesisSnapshot } from "../thesis/types";
import type { ScoreResult } from "./types";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SCORING_MODEL = "claude-sonnet-5";

/**
 * Safety-net cap on our *outer* loop, not on how many times the model can
 * search — web_search's own `max_uses` bounds that (see below). The API
 * resolves web_search rounds automatically within a single request (per
 * Anthropic's docs: "this process may repeat multiple times throughout a
 * single request"); this outer loop only exists for the case where the
 * model finishes a turn without ever calling record_score, so we can nudge
 * it rather than silently returning nothing. In the common case this loop
 * runs exactly once.
 *
 * NOTE: this multi-turn nudge pattern is implemented per the documented
 * server-tool behavior but has not been exercised against a live API call
 * (no key in the environment this was built in) — see
 * docs/ARCHITECTURE.md#scoring-design for what to watch for the first time
 * this runs for real.
 */
const MAX_OUTER_TURNS = 4;

/** Caps searches per company — cost control across a 150-300 company batch, not per-request latency. */
const WEB_SEARCH_MAX_USES = 4;

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

  return `Score this Y Combinator company against both rubrics below. This is a deep-dive pass — you have a web_search tool available (capped at ${WEB_SEARCH_MAX_USES} uses). Use it if, and only if, there's something specific worth checking: a founder's prior company, a claim on the website that's worth verifying, recent press. Don't search reflexively if the evidence already provided is enough to score confidently — the goal is a better-informed score, not maximum search volume.

When you're done gathering whatever evidence you need, call record_score. Ground every rationale in specifics; paraphrase rather than quote at length; if you found something via search, name where (e.g. "per a 2026 TechCrunch piece") so it's checkable later. If evidence for a dimension is genuinely absent even after searching, say so and score conservatively rather than guessing.

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
 * Full pass: adds the company's own website and a live web-search tool to
 * what the triage pass already had, and lets the model decide what (if
 * anything) is worth looking up before committing to a final score.
 *
 * Unlike scoreTriage's single forced tool call, tool_choice is left
 * unforced here — forcing record_score would prevent the model from
 * searching first. See docs/ARCHITECTURE.md#scoring-design for why this
 * needs a different call shape than triage rather than a flag on it.
 */
export async function scoreDeepDive({ company, thesis }: DeepDiveInput): Promise<DeepDiveResult> {
  const website = company.website ? await fetchCompanyWebsite(company.website) : null;
  const websiteAccessible = website?.accessible ?? false;
  const websiteCheckNote = company.website
    ? website?.note
    : "No website listed on the company's YC page.";

  const tools: Anthropic.Tool[] = [
    { type: "web_search_20250305", name: "web_search", max_uses: WEB_SEARCH_MAX_USES } as unknown as Anthropic.Tool,
    SCORE_TOOL,
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildDeepDivePrompt(company, thesis, website?.content, websiteCheckNote) },
  ];

  for (let turn = 0; turn < MAX_OUTER_TURNS; turn++) {
    const msg = await client().messages.create({
      model: SCORING_MODEL,
      max_tokens: 4000,
      tools,
      messages,
    });

    const scoreCall = msg.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_score"
    );
    if (scoreCall) {
      const base = buildScoreResult(scoreCall.input as RawScoreInput, "deep_dive", thesis);
      return { ...base, websiteAccessible, websiteCheckNote };
    }

    if (turn === MAX_OUTER_TURNS - 1) break; // let the loop exit and throw below, rather than pushing a nudge we'll never see answered

    // No record_score yet — carry the turn forward and nudge explicitly.
    // (Server tools like web_search resolve within the model's own turn on
    // Anthropic's side; nothing for us to inject for those. This nudge is
    // only for the case where the model wrote a final answer in plain text
    // instead of calling record_score.)
    messages.push({ role: "assistant", content: msg.content });
    messages.push({
      role: "user",
      content: "Call record_score now with your final scores — don't just describe them in text.",
    });
  }

  throw new Error(
    `Deep-dive scoring for "${company.name}" did not produce a record_score call within ${MAX_OUTER_TURNS} turns`
  );
}
