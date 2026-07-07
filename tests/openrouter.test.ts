import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

const { callForcedTool, toOpenAiTool } = await import("../src/lib/ai/openrouter");

const sampleTool = {
  name: "record_thing",
  description: "Records a thing.",
  input_schema: { type: "object", properties: { value: { type: "number" } }, required: ["value"] },
};

describe("toOpenAiTool", () => {
  it("maps input_schema onto OpenAI's parameters field with no restructuring", () => {
    const result = toOpenAiTool(sampleTool);
    expect(result).toEqual({
      type: "function",
      function: { name: "record_thing", description: "Records a thing.", parameters: sampleTool.input_schema },
    });
  });
});

describe("callForcedTool", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  it("forces the specified tool via tool_choice", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "record_thing", arguments: "{\"value\":5}" } }] } }],
    });

    await callForcedTool({ model: "anthropic/claude-sonnet-5", maxTokens: 100, userContent: "hi", tool: sampleTool });

    expect(mockCreate.mock.calls[0]?.[0].tool_choice).toEqual({ type: "function", function: { name: "record_thing" } });
  });

  it("parses the tool call's JSON arguments into the returned input", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "record_thing", arguments: "{\"value\":5}" } }] } }],
    });

    const result = await callForcedTool({ model: "anthropic/claude-sonnet-5", maxTokens: 100, userContent: "hi", tool: sampleTool });

    expect(result.input).toEqual({ value: 5 });
    expect(result.finishReason).toBe("tool_calls");
  });

  it("throws a clear error when no tool call comes back", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ finish_reason: "stop", message: { tool_calls: [] } }] });
    await expect(
      callForcedTool({ model: "anthropic/claude-sonnet-5", maxTokens: 100, userContent: "hi", tool: sampleTool })
    ).rejects.toThrow(/record_thing/);
  });

  it("throws a clear error rather than crashing when the tool call's arguments aren't valid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name: "record_thing", arguments: "{not json" } }] } }],
    });
    await expect(
      callForcedTool({ model: "anthropic/claude-sonnet-5", maxTokens: 100, userContent: "hi", tool: sampleTool })
    ).rejects.toThrow(/invalid JSON/);
  });

  it("ignores a non-function (custom) tool call type and treats it as no tool call", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "custom", custom: { name: "record_thing", input: "x" } }] } }],
    });
    await expect(
      callForcedTool({ model: "anthropic/claude-sonnet-5", maxTokens: 100, userContent: "hi", tool: sampleTool })
    ).rejects.toThrow(/record_thing/);
  });
});
