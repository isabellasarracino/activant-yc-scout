export interface BatchRow {
  id: string;
  displayName: string;
  companyCount: number | null;
  firstSyncedAt: Date;
  lastSyncedAt: Date;
}

export interface FounderRow {
  id: string;
  companyId: string;
  name: string;
  title: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  extraResearch: string | null;
}

export interface CompanyScoreRow {
  pass: "triage" | "deep_dive";
  teamGeneralScore: number | null;
  thesisAlignScore: number | null;
  primaryCategory: "team_general" | "thesis_fit" | null;
  secondaryTag: boolean;
  rubricBreakdown: unknown;
  summary: string | null;
  thesisVersionId: string | null;
  scoredAt: Date;
}

export interface CompanyRow {
  id: string;
  ycId: number | null;
  slug: string;
  name: string;
  oneLiner: string;
  longDescription: string;
  website: string | null;
  websiteAccessible: boolean | null;
  websiteCheckNote: string | null;
  ycUrl: string;
  status: string;
  teamSize: number | null;
  industries: string[];
  tags: string[];
  regions: string[];
  launchedAt: Date | null;
  founderExtractionNote: string | null;
  batchId: string;
}

export interface CompanyWithRelations extends CompanyRow {
  founders: FounderRow[];
  score: CompanyScoreRow | null;
}
