/**
 * Shape of a single company record as returned by the yc-oss community
 * mirror of YC's own Algolia index (https://github.com/yc-oss/api).
 * This is a *third-party* mirror, not an official YC API — see
 * docs/DATA_SOURCES.md for why we depend on it and what the fallback is
 * if it ever goes away.
 *
 * Field names/casing match the upstream JSON exactly (snake_case) so a
 * diff against a fresh fixture pull is easy to eyeball.
 */
export interface YCMirrorCompany {
  id: number;
  name: string;
  slug: string;
  former_names: string[];
  small_logo_thumb_url: string;
  website: string;
  all_locations: string;
  long_description: string;
  one_liner: string;
  team_size: number;
  industry: string;
  subindustry: string;
  /** Unix seconds */
  launched_at: number;
  tags: string[];
  tags_highlighted: string[];
  top_company: boolean;
  isHiring: boolean;
  nonprofit: boolean;
  /** Human-readable, e.g. "Summer 2026" */
  batch: string;
  status: string;
  industries: string[];
  regions: string[];
  stage: string;
  app_video_public: boolean;
  demo_day_video_public: boolean;
  url: string;
  api: string;
}

export interface Founder {
  name: string;
  title?: string;
  bio?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
}

/**
 * A company after we've merged the mirror's bulk metadata with whatever
 * we could pull from the company's own YC profile page. This is the
 * shape that gets written to the `Company` + `Founder` tables.
 */
export interface NormalizedCompany {
  ycId: number;
  slug: string;
  name: string;
  oneLiner: string;
  longDescription: string;
  website: string | null;
  ycUrl: string;
  status: string;
  teamSize: number;
  industries: string[];
  tags: string[];
  regions: string[];
  launchedAt: Date;
  batchSlug: string;
  batchDisplayName: string;
  founders: Founder[];
  /** Set when founder-page fetch/extraction degraded rather than throwing. */
  founderExtractionNote?: string;
}

export interface BatchMeta {
  slug: string;
  displayName: string;
  count: number;
}
