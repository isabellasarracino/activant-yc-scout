import type { BatchDTO, CompanyCompactDTO, CompanyFullDTO } from "../../src/lib/api/serialize";
import type { BatchDetailResponse } from "../../src/lib/api/client";

export const sampleBatch: BatchDTO = {
  id: "summer-2026",
  displayName: "Summer 2026",
  companyCount: 54,
  firstSyncedAt: "2026-07-01T00:00:00.000Z",
  lastSyncedAt: "2026-07-05T12:00:00.000Z",
};

export const sampleCompactCompany: CompanyCompactDTO = {
  slug: "florin",
  name: "Florin",
  oneLiner: "The financial operating system for the companies building the future.",
  website: "https://florin.inc",
  teamSize: 3,
  industries: ["Fintech"],
  tags: ["Banking as a Service"],
  status: "Active",
  batchId: "summer-2026",
  primaryCategory: "thesis_fit",
  secondaryTag: false,
  teamGeneralScore: 6.2,
  thesisAlignScore: 8.4,
  pass: "deep_dive",
  summary: "Strong fintech infra play with a credible technical founder.",
};

export const sampleFullCompany: CompanyFullDTO = {
  ...sampleCompactCompany,
  longDescription: "Florin brings banking, payments, cards, and treasury into one account built for startups.",
  ycUrl: "https://www.ycombinator.com/companies/florin",
  websiteAccessible: true,
  websiteCheckNote: null,
  regions: ["United States of America"],
  launchedAt: "2026-06-25T00:00:00.000Z",
  founderExtractionNote: null,
  founders: [
    {
      name: "Shaurya Aggarwal",
      title: "Founder & CEO",
      bio: "Built TPUs at Google.",
      linkedinUrl: "https://www.linkedin.com/in/shauryaagg",
      twitterUrl: null,
    },
  ],
  rubricBreakdown: {
    team_general: [
      { dimension: "founder_market_fit", label: "Founder-market fit", score: 6, rationale: "Solid but not a direct edge." },
      { dimension: "founder_track_record", label: "Founder track record & pedigree", score: 6.5, rationale: "Notable prior role at Google." },
      { dimension: "team_completeness", label: "Team completeness", score: 5, rationale: "Solo founder so far." },
      { dimension: "idea_quality", label: "Idea quality & differentiation", score: 7, rationale: "Sharp wedge into startup banking." },
      { dimension: "execution_signal", label: "Execution signal", score: 6, rationale: "Working product, early traction." },
    ],
    thesis_fit: [
      { dimension: "sector_alignment", label: "Sector / vertical alignment", score: 9, rationale: "Squarely fintech infrastructure." },
      { dimension: "business_model_fit", label: "Business model fit", score: 8, rationale: "Recurring, infrastructure-style revenue." },
      { dimension: "research_alignment", label: "Alignment with recent research themes", score: 8, rationale: "Directly responsive to embedded finance thesis." },
      { dimension: "category_potential", label: "Category-defining / large-market potential", score: 8.5, rationale: "Clear path to category leadership." },
    ],
  },
  scoredAt: "2026-07-05T12:00:00.000Z",
};

export const sampleBatchDetail: BatchDetailResponse = {
  batch: sampleBatch,
  ranked: [sampleCompactCompany],
  unranked: [],
};
