import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullRawScore, sampleCompany, sampleThesis } from "./fixtures/testData";

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

function toolCallResponse(input: unknown, finishReason: string = "tool_calls") {
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

const { scoreTriage } = await import("../src/lib/scoring/triage");

describe("scoreTriage", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  it("sends the company's evidence and the live thesis text in the prompt", async () => {
    mockCreate.mockResolvedValueOnce(toolCallResponse(fullRawScore()));

    await scoreTriage({ company: sampleCompany, thesis: sampleThesis });

    const sentPrompt = mockCreate.mock.calls[0]?.[0].messages[0].content as string;
    expect(sentPrompt).toContain("Florin");
    expect(sentPrompt).toContain("Shaurya Aggarwal");
    expect(sentPrompt).toContain(sampleThesis.summary);
    expect(sentPrompt).toContain(sampleThesis.source);
  });

  it("forces the record_score tool so a response is always structured", async () => {
    mockCreate.mockResolvedValueOnce(toolCallResponse(fullRawScore()));
    await scoreTriage({ company: sampleCompany, thesis: sampleThesis });
    expect(mockCreate.mock.calls[0]?.[0].tool_choice).toEqual({ type: "function", function: { name: "record_score" } });
  });

  it("never sends any tool other than record_score", async () => {
    mockCreate.mockResolvedValueOnce(toolCallResponse(fullRawScore()));
    await scoreTriage({ company: sampleCompany, thesis: sampleThesis });
    const toolNames = mockCreate.mock.calls[0]?.[0].tools.map((t: { function: { name: string } }) => t.function.name);
    expect(toolNames).toEqual(["record_score"]);
  });

  it("computes composites and categorization from the model's dimension scores", async () => {
    mockCreate.mockResolvedValueOnce(
      toolCallResponse(
        fullRawScore({
          team: { founder_market_fit: 9, founder_track_record: 9, team_completeness: 8, idea_quality: 9, execution_signal: 7 },
          thesisScores: { sector_alignment: 9, business_model_fit: 8, research_alignment: 7, category_potential: 8 },
        })
      )
    );

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
    mockCreate.mockResolvedValueOnce({ choices: [{ finish_reason: "stop", message: { tool_calls: [] } }] });
    await expect(scoreTriage({ company: sampleCompany, thesis: sampleThesis })).rejects.toThrow(/Florin/);
  });

  it("throws a clear error when the response was cut off at the token limit, rather than passing a truncated tool call through", async () => {
    // Real failure mode hit on the actual Summer 2026 batch run: a
    // truncated record_score call crashes deep inside buildScoreResult
    // with a generic error unless caught here first.
    mockCreate.mockResolvedValueOnce(toolCallResponse({ team_general: {} }, "length"));
    await expect(scoreTriage({ company: sampleCompany, thesis: sampleThesis })).rejects.toThrow(/cut off/i);
  });

  it("requests a large enough token budget to make truncation rare", async () => {
    mockCreate.mockResolvedValueOnce(toolCallResponse(fullRawScore()));
    await scoreTriage({ company: sampleCompany, thesis: sampleThesis });
    expect(mockCreate.mock.calls[0]?.[0].max_tokens).toBeGreaterThanOrEqual(4096);
  });
});
