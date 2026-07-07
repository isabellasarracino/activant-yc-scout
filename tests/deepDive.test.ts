import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullRawScore, sampleCompany, sampleThesis } from "./fixtures/testData";

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock("../src/lib/yc/companyWebsite", () => ({
  fetchCompanyWebsite: vi.fn(),
}));

function toolCallResponse(input: unknown = fullRawScore(), finishReason: string = "tool_calls") {
  return {
    choices: [
      {
        finish_reason: finishReason,
        message: {
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "record_score", arguments: JSON.stringify(input) } },
          ],
        },
      },
    ],
  };
}

const { scoreDeepDive } = await import("../src/lib/scoring/deepDive");
const { fetchCompanyWebsite } = await import("../src/lib/yc/companyWebsite");

describe("scoreDeepDive", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(fetchCompanyWebsite).mockReset();
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  it("includes fetched website content in the prompt and reports websiteAccessible: true", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "Florin is a banking platform for startups." });
    mockCreate.mockResolvedValueOnce(toolCallResponse());

    const result = await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });

    expect(result.websiteAccessible).toBe(true);
    expect(result.websiteCheckNote).toBeUndefined();
    const sentPrompt = mockCreate.mock.calls[0]?.[0].messages[0].content as string;
    expect(sentPrompt).toContain("Florin is a banking platform for startups.");
  });

  it("degrades gracefully with a note when the website is unreachable — never blocks scoring", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: false, note: "Company website did not respond within 8s." });
    mockCreate.mockResolvedValueOnce(toolCallResponse());

    const result = await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });

    expect(result.websiteAccessible).toBe(false);
    expect(result.websiteCheckNote).toMatch(/did not respond/);
    expect(result.primaryCategory).not.toBeUndefined(); // scoring still completed
  });

  it("skips the website fetch entirely and notes it when the company has no website listed", async () => {
    mockCreate.mockResolvedValueOnce(toolCallResponse());
    const noSiteCompany = { ...sampleCompany, website: null };

    const result = await scoreDeepDive({ company: noSiteCompany, thesis: sampleThesis });

    expect(fetchCompanyWebsite).not.toHaveBeenCalled();
    expect(result.websiteAccessible).toBe(false);
    expect(result.websiteCheckNote).toMatch(/No website listed/);
  });

  it("forces record_score in a single call — no web_search tool, no multi-turn loop, since that Anthropic-only capability was dropped in the OpenRouter switch", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "content" });
    mockCreate.mockResolvedValueOnce(toolCallResponse());

    await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0]?.[0];
    expect(call.tool_choice).toEqual({ type: "function", function: { name: "record_score" } });
    const toolNames = call.tools.map((t: { function: { name: string } }) => t.function.name);
    expect(toolNames).toEqual(["record_score"]);
  });

  it("throws a clear, company-identifying error when the model returns no tool call", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "content" });
    mockCreate.mockResolvedValueOnce({ choices: [{ finish_reason: "stop", message: { tool_calls: [] } }] });

    await expect(scoreDeepDive({ company: sampleCompany, thesis: sampleThesis })).rejects.toThrow(/Florin/);
  });

  it("throws a clear error when the response was cut off at the token limit", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "content" });
    mockCreate.mockResolvedValueOnce(toolCallResponse({ team_general: {} }, "length"));

    await expect(scoreDeepDive({ company: sampleCompany, thesis: sampleThesis })).rejects.toThrow(/cut off/i);
  });

  it("tags the result pass as deep_dive, distinct from triage", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "content" });
    mockCreate.mockResolvedValueOnce(toolCallResponse());
    const result = await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });
    expect(result.pass).toBe("deep_dive");
  });
});
