import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullRawScore, sampleCompany, sampleThesis } from "./fixtures/testData";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("../src/lib/yc/companyWebsite", () => ({
  fetchCompanyWebsite: vi.fn(),
}));

const { scoreDeepDive } = await import("../src/lib/scoring/deepDive");
const { fetchCompanyWebsite } = await import("../src/lib/yc/companyWebsite");

function recordScoreResponse(input = fullRawScore()) {
  return { content: [{ type: "tool_use", id: "t1", name: "record_score", input }] };
}

describe("scoreDeepDive", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(fetchCompanyWebsite).mockReset();
  });

  it("includes fetched website content in the prompt and reports websiteAccessible: true", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "Florin is a banking platform for startups." });
    mockCreate.mockResolvedValueOnce(recordScoreResponse());

    const result = await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });

    expect(result.websiteAccessible).toBe(true);
    expect(result.websiteCheckNote).toBeUndefined();
    const sentPrompt = mockCreate.mock.calls[0]?.[0].messages[0].content as string;
    expect(sentPrompt).toContain("Florin is a banking platform for startups.");
  });

  it("degrades gracefully with a note when the website is unreachable — never blocks scoring", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: false, note: "Company website did not respond within 8s." });
    mockCreate.mockResolvedValueOnce(recordScoreResponse());

    const result = await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });

    expect(result.websiteAccessible).toBe(false);
    expect(result.websiteCheckNote).toMatch(/did not respond/);
    expect(result.primaryCategory).not.toBeUndefined(); // scoring still completed
  });

  it("skips the website fetch entirely and notes it when the company has no website listed", async () => {
    mockCreate.mockResolvedValueOnce(recordScoreResponse());
    const noSiteCompany = { ...sampleCompany, website: null };

    const result = await scoreDeepDive({ company: noSiteCompany, thesis: sampleThesis });

    expect(fetchCompanyWebsite).not.toHaveBeenCalled();
    expect(result.websiteAccessible).toBe(false);
    expect(result.websiteCheckNote).toMatch(/No website listed/);
  });

  it("gives the model both web_search (capped) and record_score, without forcing tool_choice", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "content" });
    mockCreate.mockResolvedValueOnce(recordScoreResponse());

    await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });

    const call = mockCreate.mock.calls[0]?.[0];
    expect(call.tool_choice).toBeUndefined(); // must be free to search before scoring
    expect(call.tools).toContainEqual(expect.objectContaining({ type: "web_search_20250305", max_uses: 4 }));
    expect(call.tools.some((t: { name?: string }) => t.name === "record_score")).toBe(true);
  });

  it("loops and nudges when the model responds without calling record_score, then succeeds on the next turn", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "content" });
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "Let me think about this." }] })
      .mockResolvedValueOnce(recordScoreResponse());

    const result = await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.pass).toBe("deep_dive");
    // second call should carry the first turn forward plus a nudge
    const secondCallMessages = mockCreate.mock.calls[1]?.[0].messages;
    expect(secondCallMessages.at(-1).content).toMatch(/Call record_score now/);
  });

  it("throws a clear, company-identifying error if record_score is never called within the turn cap", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "content" });
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "Still thinking." }] });

    await expect(scoreDeepDive({ company: sampleCompany, thesis: sampleThesis })).rejects.toThrow(/Florin/);
  });

  it("tags the result pass as deep_dive, distinct from triage", async () => {
    vi.mocked(fetchCompanyWebsite).mockResolvedValue({ accessible: true, content: "content" });
    mockCreate.mockResolvedValueOnce(recordScoreResponse());
    const result = await scoreDeepDive({ company: sampleCompany, thesis: sampleThesis });
    expect(result.pass).toBe("deep_dive");
  });
});
