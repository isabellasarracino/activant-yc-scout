import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManualThesisProvider } from "../src/lib/thesis/manualProvider";

describe("ManualThesisProvider", () => {
  it("reads and trims the thesis file's content", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "thesis-test-"));
    const filePath = path.join(dir, "current.md");
    writeFileSync(filePath, "\n  Test thesis content.  \n");

    const provider = new ManualThesisProvider(filePath);
    const snapshot = await provider.getCurrentThesis();

    expect(snapshot.source).toBe("manual");
    expect(snapshot.summary).toBe("Test thesis content.");
    expect(snapshot.fetchedAt).toBeInstanceOf(Date);

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a specific, actionable error when the file doesn't exist", async () => {
    const provider = new ManualThesisProvider("/definitely/not/a/real/path/current.md");
    await expect(provider.getCurrentThesis()).rejects.toThrow(/Could not read thesis file/);
  });

  it("defaults to docs/thesis/current.md and can actually read the real placeholder shipped in this repo", async () => {
    const provider = new ManualThesisProvider();
    const snapshot = await provider.getCurrentThesis();
    expect(snapshot.summary).toContain("Activant");
    expect(snapshot.summary.length).toBeGreaterThan(100);
  });
});

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    beta = { messages: { create: mockCreate } };
  },
}));

const { McpThesisProvider } = await import("../src/lib/thesis/mcpProvider");

describe("McpThesisProvider", () => {
  beforeEach(() => mockCreate.mockReset());

  it("throws a clear, actionable error when no MCP URL is configured, rather than a confusing failure deeper in", async () => {
    const provider = new McpThesisProvider(undefined, undefined);
    await expect(provider.getCurrentThesis()).rejects.toThrow(/ACTIVANT_RESEARCH_MCP_URL is not set/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("calls the current (2025-11-20) MCP connector API shape, not the deprecated one", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "Thesis summary text." }] });

    const provider = new McpThesisProvider("https://activant-research.fastmcp.app/mcp", "test-token");
    await provider.getCurrentThesis();

    const call = mockCreate.mock.calls[0]?.[0];
    expect(call.betas).toContain("mcp-client-2025-11-20");
    expect(call.mcp_servers[0]).toMatchObject({
      type: "url",
      url: "https://activant-research.fastmcp.app/mcp",
      authorization_token: "test-token",
    });
    // Current pattern: tool config lives in `tools`, not nested in mcp_servers.
    expect(call.tools).toContainEqual({ type: "mcp_toolset", mcp_server_name: "activant-research" });
  });

  it("returns the summarized thesis text with source metadata on success", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "  Fintech and supply chain focus.  " }] });
    const provider = new McpThesisProvider("https://activant-research.fastmcp.app/mcp", "test-token");
    const snapshot = await provider.getCurrentThesis();
    expect(snapshot).toMatchObject({ source: "activant_research_mcp", summary: "Fintech and supply chain focus." });
  });

  it("throws rather than silently returning an empty thesis if the connector returns no text", async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });
    const provider = new McpThesisProvider("https://activant-research.fastmcp.app/mcp", "test-token");
    await expect(provider.getCurrentThesis()).rejects.toThrow(/returned no text content/);
  });
});
