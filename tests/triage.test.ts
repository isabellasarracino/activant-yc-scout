import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullRawScore, sampleCompany, sampleThesis } from "./fixtures/testData";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

const { scoreTriage } = await import("../src/lib/scoring/triage");

describe("scoreTriage", () => {
  beforeEach(() => mockCreate.mockReset());

  it("sends the company's evidence and the live thesis text in the prompt", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "t1", name: "record_score", input: fullRawScore() }],
    });

    await scoreTriage({ company: sampleCompany, thesis: sampleThesis });

    const sentPrompt = mockCreate.mock.calls[0]?.[0].messages[0].content as string;
    expect(sentPrompt).toContain("Florin");
    expect(sentPrompt).toContain("Shaurya Aggarwal");
    expect(sentPrompt).toContain(sampleThesis.summary);
    expect(sentPrompt).toContain(sampleThesis.source);
  });

  it("forces the record_score tool so a response is always structured", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "t1", name: "record_score", input: fullRawScore() }],
    });
    await scoreTriage({ company: sampleCompany, thesis: sampleThesis });
    expect(mockCreate.mock.calls[0]?.[0].tool_choice).toEqual({ type: "tool", name: "record_score" });
  });

  it("never sends a web_search tool — triage only ever sees the record_score tool", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "t1", name: "record_score", input: fullRawScore() }],
    });
    await scoreTriage({ company: sampleCompany, thesis: sampleThesis });
    const toolNames = mockCreate.mock.calls[0]?.[0].tools.map((t: { name?: string; type: string }) => t.name ?? t.type);
    expect(toolNames).toEqual(["record_score"]);
  });

  it("computes composites and categorization from the model's dimension scores", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "record_score",
          input: fullRawScore({
            team: { founder_market_fit: 9, founder_track_record: 9, team_completeness: 8, idea_quality: 9, execution_signal: 7 },
            thesisScores: { sector_alignment: 9, business_model_fit: 8, research_alignment: 7, category_potential: 8 },
          }),
        },
      ],
    });

    const result = await scoreTriage({ company: sampleCompany, thesis: sampleThesis });

    expect(result.pass).toBe("triage");
    expect(result.teamGeneralScore).toBeGreaterThan(8);
    expect(result.thesisAlignScore).toBeGreaterThan(7.5);
    expect(result.primaryCategory).not.toBeNull();
    expect(result.rubricBreakdown.team_general).toHaveLength(5);
    expect(result.rubricBreakdown.thesis_fit).toHaveLength(4);
    expect(result.thesisVersionSource).toBe("manual");
  });

  it("throws a clear, company-identifying error when the model returns no tool call", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "I'm not sure how to score this." }] });
    await expect(scoreTriage({ company: sampleCompany, thesis: sampleThesis })).rejects.toThrow(/Florin/);
  });
});
