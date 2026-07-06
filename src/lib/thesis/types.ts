export interface ThesisSnapshot {
  source: "activant_research_mcp" | "manual";
  /** Plain-text summary the scoring prompt is built from. */
  summary: string;
  fetchedAt: Date;
  /** Unprocessed response, kept for debugging / audit, never sent back to the model. */
  rawContent?: unknown;
}

export interface ThesisProvider {
  getCurrentThesis(): Promise<ThesisSnapshot>;
}
