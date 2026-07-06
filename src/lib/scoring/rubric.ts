/**
 * The two evaluation rubrics. This file is the product, as much as any UI
 * screen is — see docs/RUBRIC.md for the same content in plain language for
 * non-engineers to review, and keep the two in sync if you edit this.
 *
 * Anchors (score 2 / 5 / 8 guides) exist for two reasons: they give the
 * scoring model a calibrated sense of what a given number means instead of
 * scoring on vibes, and they give a human reviewer a concrete way to check
 * whether a given score seems right, which is the whole point of exposing
 * the rubric rather than just a black-box composite.
 */

export interface ScoreAnchor {
  score: number;
  guide: string;
}

export interface RubricDimension {
  key: string;
  label: string;
  description: string;
  /** Fraction of the composite score. All dimensions in a rubric sum to 1. */
  weight: number;
  anchors: ScoreAnchor[];
}

export interface Rubric {
  criterion: "team_general" | "thesis_fit";
  label: string;
  dimensions: RubricDimension[];
}

export const TEAM_GENERAL_RUBRIC: Rubric = {
  criterion: "team_general",
  label: "Team & General Interest",
  dimensions: [
    {
      key: "founder_market_fit",
      label: "Founder-market fit",
      description:
        "Do the founders' specific backgrounds explain why they are unusually well positioned to win this problem — direct domain expertise, technical depth matched to the product, or lived experience of the pain point?",
      weight: 0.25,
      anchors: [
        { score: 2, guide: "No visible connection between founders' backgrounds and the problem; generalist founders on an unrelated pivot." },
        { score: 5, guide: "Plausible, general relevance (e.g. strong engineers building a dev tool) but no specific edge in this exact space." },
        { score: 8, guide: "Founders have direct, hard-to-replicate expertise in this exact problem — built the analogous system before, deep domain background, or lived the pain personally at scale." },
      ],
    },
    {
      key: "founder_track_record",
      label: "Founder track record & pedigree",
      description:
        "Prior notable outcomes: previous startups (especially with a meaningful exit or scale), notable/competitive companies worked at, or distinguished technical/academic achievement.",
      weight: 0.25,
      anchors: [
        { score: 2, guide: "No prior notable outcomes visible; first professional venture, unremarkable prior employers." },
        { score: 5, guide: "Solid but unremarkable background — competent prior roles, no standout signal either way." },
        { score: 8, guide: "Clear standout signal: a prior exit, senior role at a top-tier company in a directly relevant function, or a distinguished technical/research record." },
      ],
    },
    {
      key: "team_completeness",
      label: "Team completeness",
      description:
        "Does the founding team cover what the business actually needs — technical build capability and the commercial/GTM side — or is there an obvious, unaddressed gap?",
      weight: 0.15,
      anchors: [
        { score: 2, guide: "Solo founder or team with an obvious, unaddressed gap for what the business requires." },
        { score: 5, guide: "Team covers the build side; commercial/GTM capability unclear or unproven." },
        { score: 8, guide: "Team visibly covers both build and go-to-market, or the gap is a non-issue for this specific business." },
      ],
    },
    {
      key: "idea_quality",
      label: "Idea quality & differentiation",
      description:
        "Is this an interesting, differentiated take on a real problem, or a crowded/undifferentiated entry into an already-saturated space?",
      weight: 0.2,
      anchors: [
        { score: 2, guide: "Undifferentiated entry into an already-crowded space with no clear wedge." },
        { score: 5, guide: "Reasonable idea, unclear differentiation from existing players." },
        { score: 8, guide: "Sharp, specific wedge into a real problem with a clear reason this approach wins now." },
      ],
    },
    {
      key: "execution_signal",
      label: "Execution signal",
      description:
        "Visible evidence of momentum from the YC page or company site — named customers, stated revenue/usage figures, a live/functional product, or a professional site vs. a bare placeholder.",
      weight: 0.15,
      anchors: [
        { score: 2, guide: "No visible evidence of a working product or any traction; placeholder or near-empty site." },
        { score: 5, guide: "A working product/demo is visible; no concrete traction signal yet." },
        { score: 8, guide: "Concrete, named evidence of traction — customers, revenue/usage figures, or clear production deployment." },
      ],
    },
  ],
};

export const THESIS_FIT_RUBRIC: Rubric = {
  criterion: "thesis_fit",
  label: "Activant Thesis Fit",
  dimensions: [
    {
      key: "sector_alignment",
      label: "Sector / vertical alignment",
      description:
        "How closely the company's market matches Activant's current thesis verticals (populated from the live thesis — see docs/thesis/current.md for the version in effect at scoring time).",
      weight: 0.3,
      anchors: [
        { score: 2, guide: "No meaningful overlap with any current thesis vertical." },
        { score: 5, guide: "Adjacent to a thesis vertical but not a direct hit." },
        { score: 8, guide: "Squarely inside a current thesis vertical." },
      ],
    },
    {
      key: "business_model_fit",
      label: "Business model fit",
      description:
        "Recurring/infrastructure-style revenue, embedded or platform dynamics, marketplace or network effects — the shape of business Activant's thesis favors, as opposed to a one-off or low-durability model.",
      weight: 0.25,
      anchors: [
        { score: 2, guide: "Low-durability or one-off revenue model (e.g. services-heavy, no recurring mechanism)." },
        { score: 5, guide: "Plausible recurring model, unproven durability or differentiation." },
        { score: 8, guide: "Strong infrastructure/platform/marketplace dynamics with clear durability and expansion potential." },
      ],
    },
    {
      key: "research_alignment",
      label: "Alignment with recent research themes",
      description:
        "Direct alignment with specific themes Activant's research team has published on recently — not just the general sector list. Populated dynamically from the current thesis snapshot, not hardcoded.",
      weight: 0.25,
      anchors: [
        { score: 2, guide: "No connection to any recently published research theme." },
        { score: 5, guide: "Loosely related to a published theme." },
        { score: 8, guide: "Directly responsive to a specific, recently published thesis point." },
      ],
    },
    {
      key: "category_potential",
      label: "Category-defining / large-market potential",
      description:
        "Positioned to become a large, durable category leader — reaching what Activant's own materials call \"escape velocity\" — rather than a small, bounded niche tool.",
      weight: 0.2,
      anchors: [
        { score: 2, guide: "Narrow, bounded niche with a low ceiling even at full success." },
        { score: 5, guide: "Meaningful market, unclear ceiling or path to category leadership." },
        { score: 8, guide: "Clear path to a large, durable category position if execution holds." },
      ],
    },
  ],
};

export const RUBRICS = [TEAM_GENERAL_RUBRIC, THESIS_FIT_RUBRIC] as const;

/** Weighted composite from per-dimension scores, rounded to one decimal on a 0-10 scale. */
export function compositeScore(rubric: Rubric, dimensionScores: Record<string, number>): number {
  let total = 0;
  for (const dim of rubric.dimensions) {
    const s = dimensionScores[dim.key];
    if (s === undefined) {
      throw new Error(`Missing score for dimension "${dim.key}" in rubric "${rubric.criterion}"`);
    }
    total += s * dim.weight;
  }
  return Math.round(total * 10) / 10;
}
