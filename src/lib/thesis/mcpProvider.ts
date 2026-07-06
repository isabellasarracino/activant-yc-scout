import Anthropic from "@anthropic-ai/sdk";
import type { ThesisProvider, ThesisSnapshot } from "./types";

const SUMMARIZE_PROMPT =
  "Summarize Activant Capital's current research thesis, priority sectors, and " +
  "any recently published themes in 300-500 words, written so it can be used " +
  "directly as scoring criteria for evaluating early-stage companies. Pull from " +
  "the most recent research available rather than general firm background.";

/**
 * Pulls the current thesis from the "Activant Research" MCP connector via
 * the Claude API's MCP connector support, so rubric 2 never depends on a
 * hand-copied snapshot going stale.
 *
 * STATUS: structurally complete, unit-tested against a mocked API
 * response, but NOT yet exercised against the real connector. Two things
 * to confirm before this goes live:
 *
 * 1. Auth. Claude.ai brokers the OAuth handshake for you when you use this
 *    connector inside a chat or an Artifact — a standalone server has to
 *    do that itself and hold a long-lived credential
 *    (ACTIVANT_RESEARCH_MCP_TOKEN). Whether the fastmcp.app-hosted
 *    connector issues one, and how, is an open question — see
 *    docs/ARCHITECTURE.md#thesis-source.
 * 2. API shape. The MCP connector's request format changed recently —
 *    this file uses the current one (betas: ["mcp-client-2025-11-20"],
 *    tool config as an {type: "mcp_toolset"} entry in `tools`). If
 *    Anthropic ships another migration before this goes live, check
 *    https://docs.claude.com/en/agents-and-tools/mcp-connector before
 *    assuming this file is still current.
 *
 * Until both are confirmed, use ManualThesisProvider.
 */
export class McpThesisProvider implements ThesisProvider {
  constructor(
    private mcpUrl: string | undefined = process.env.ACTIVANT_RESEARCH_MCP_URL,
    private mcpToken: string | undefined = process.env.ACTIVANT_RESEARCH_MCP_TOKEN,
    private client: Anthropic = new Anthropic()
  ) {}

  async getCurrentThesis(): Promise<ThesisSnapshot> {
    if (!this.mcpUrl) {
      throw new Error(
        "ACTIVANT_RESEARCH_MCP_URL is not set. Use ManualThesisProvider until the connector's " +
          "standalone auth is confirmed (see docs/ARCHITECTURE.md#thesis-source)."
      );
    }

    const serverName = "activant-research";
    const response = await this.client.beta.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      betas: ["mcp-client-2025-11-20"],
      mcp_servers: [
        {
          type: "url",
          url: this.mcpUrl,
          name: serverName,
          ...(this.mcpToken ? { authorization_token: this.mcpToken } : {}),
        },
      ],
      tools: [{ type: "mcp_toolset", mcp_server_name: serverName } as never],
      messages: [{ role: "user", content: SUMMARIZE_PROMPT }],
    } as never);

    const summary = response.content
      .filter((b: { type: string }): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!summary) {
      throw new Error(
        "Activant Research MCP call returned no text content — check that the connector is reachable and the token is valid."
      );
    }

    return { source: "activant_research_mcp", summary, fetchedAt: new Date(), rawContent: response };
  }
}
