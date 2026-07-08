import type { NormalizedCompany } from "../../src/lib/yc/types";
import type { ThesisSnapshot } from "../../src/lib/thesis/types";
import type { RawScoreInput } from "../../src/lib/scoring/types";

export const sampleCompany: NormalizedCompany = {
  ycId: 33282,
  slug: "florin",
  name: "Florin",
  oneLiner: "The financial operating system for the companies building the future.",
  longDescription: "Florin brings banking, payments, cards, and treasury into one account built for startups.",
  website: "https://florin.inc",
  ycUrl: "https://www.ycombinator.com/companies/florin",
  status: "Active",
  teamSize: 3,
  industries: ["Fintech"],
  tags: ["Banking as a Service", "Neobank"],
  regions: ["United States of America"],
  launchedAt: new Date("2026-06-25"),
  batchSlug: "summer-2026",
  batchDisplayName: "Summer 2026",
  founders: [
    {
      name: "Shaurya Aggarwal",
      title: "Founder & CEO",
      bio: "Built TPUs at Google.",
      linkedinUrl: "https://www.linkedin.com/in/shauryaagg",
    },
  ],
};

export const sampleThesis: ThesisSnapshot = {
  source: "manual",
  summary: "Activant invests in commerce infrastructure, fintech, supply chain, and vertical SaaS.",
  fetchedAt: new Date("2026-07-01"),
};

const TEAM_DIMS = ["founder_market_fit", "founder_track_record", "team_completeness", "idea_quality", "execution_signal"];
const THESIS_DIMS = ["sector_alignment", "business_model_fit", "research_alignment", "category_potential"];

export function fullRawScore(
  overrides: { team?: Record<string, number>; thesisScores?: Record<string, number> } = {}
): RawScoreInput {
  return {
    team_general: Object.fromEntries(
      TEAM_DIMS.map((k) => [k, { score: overrides.team?.[k] ?? 7, rationale: `Rationale for ${k}` }])
    ),
    thesis_fit: Object.fromEntries(
      THESIS_DIMS.map((k) => [k, { score: overrides.thesisScores?.[k] ?? 7, rationale: `Rationale for ${k}` }])
    ),
    primary_vertical: "Fintech",
    summary: "Strong fintech infra play with a credible technical founder.",
  };
}
