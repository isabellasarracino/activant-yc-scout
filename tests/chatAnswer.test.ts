import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "./fixtures/fakeDb";
import { sampleCompany, sampleThesis, fullRawScore } from "./fixtures/testData";
import { upsertBatch, upsertCompanyWithFounders, upsertScore } from "../src/lib/db/repository";
import { buildScoreResult } from "../src/lib/scoring/scoreTool";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

const { answerChatQuestion } = await import("../src/lib/chat/answer");

async function seedOneCompany() {
  const db = createFakeDb();
  const batch = await upsertBatch(db, "Summer 2026", 1);
  const { id } = await upsertCompanyWithFounders(db, batch.id, sampleCompany);
  await upsertScore(db, id, buildScoreResult(fullRawScore(), "triage", sampleThesis));
  return db;
}

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}
function toolCallResponse(name: string, input: unknown, id = "call_1") {
  return { content: [{ type: "tool_use", id, name, input }] };
}

describe("answerChatQuestion", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns the model's plain-text answer directly when it doesn't need any tools", async () => {
    const db = await seedOneCompany();
    mockCreate.mockResolvedValueOnce(textResponse("There are no companies from that batch yet."));

    const answer = await answerChatQuestion(db, "What batches exist?");

    expect(answer).toBe("There are no companies from that batch yet.");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("executes a requested tool call, feeds the result back, and returns the follow-up answer", async () => {
    const db = await seedOneCompany();
    mockCreate
      .mockResolvedValueOnce(toolCallResponse("search_companies", { query: "florin" }))
      .mockResolvedValueOnce(textResponse("Florin is a fintech company from Summer 2026."));

    const answer = await answerChatQuestion(db, "Tell me about Florin");

    expect(answer).toBe("Florin is a fintech company from Summer 2026.");
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // The second call should carry a tool_result referencing the first call's tool_use_id.
    const secondCallMessages = mockCreate.mock.calls[1]?.[0].messages;
    const toolResultMessage = secondCallMessages.at(-1);
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content[0].type).toBe("tool_result");
    expect(toolResultMessage.content[0].tool_use_id).toBe("call_1");
    expect(JSON.parse(toolResultMessage.content[0].content)[0].slug).toBe("florin");
  });

  it("chains multiple tool calls across turns (search then get_company)", async () => {
    const db = await seedOneCompany();
    mockCreate
      .mockResolvedValueOnce(toolCallResponse("search_companies", { query: "florin" }, "call_1"))
      .mockResolvedValueOnce(toolCallResponse("get_company", { slug: "florin" }, "call_2"))
      .mockResolvedValueOnce(textResponse("Florin's founder previously built TPUs at Google."));

    const answer = await answerChatQuestion(db, "Who founded the strongest fintech company?");

    expect(answer).toBe("Florin's founder previously built TPUs at Google.");
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("handles multiple tool_use blocks within a single turn", async () => {
    const db = await seedOneCompany();
    mockCreate
      .mockResolvedValueOnce({
        content: [
          { type: "tool_use", id: "call_1", name: "list_batches", input: {} },
          { type: "tool_use", id: "call_2", name: "search_companies", input: { query: "florin" } },
        ],
      })
      .mockResolvedValueOnce(textResponse("Done."));

    const answer = await answerChatQuestion(db, "What's out there?");

    expect(answer).toBe("Done.");
    const secondCallMessages = mockCreate.mock.calls[1]?.[0].messages;
    const toolResultMessage = secondCallMessages.at(-1);
    expect(toolResultMessage.content).toHaveLength(2);
    expect(toolResultMessage.content.map((c: { tool_use_id: string }) => c.tool_use_id)).toEqual(["call_1", "call_2"]);
  });

  it("passes prior conversation history through to the model", async () => {
    const db = await seedOneCompany();
    mockCreate.mockResolvedValueOnce(textResponse("Yes, as I mentioned, it's a strong pick."));

    await answerChatQuestion(db, "Are you sure?", [
      { role: "user", content: "Is Florin a good fit?" },
      { role: "assistant", content: "Yes, it looks like a strong thesis fit." },
    ]);

    const sentMessages = mockCreate.mock.calls[0]?.[0].messages;
    expect(sentMessages[0]).toEqual({ role: "user", content: "Is Florin a good fit?" });
    expect(sentMessages[2]).toEqual({ role: "user", content: "Are you sure?" });
  });

  it("forces a plain-text final answer without tools once MAX_TOOL_TURNS is hit, rather than erroring", async () => {
    const db = await seedOneCompany();
    // Every regular turn keeps calling a tool...
    mockCreate.mockResolvedValue(toolCallResponse("list_batches", {}));
    // ...except the final forced call, which must come back as text.
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c1"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c2"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c3"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c4"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c5"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c6"));
    mockCreate.mockResolvedValueOnce(textResponse("Here's what I found across the turns."));

    const answer = await answerChatQuestion(db, "Keep digging forever");

    expect(answer).toBe("Here's what I found across the turns.");
    // 6 tool-calling turns + 1 forced final call.
    expect(mockCreate).toHaveBeenCalledTimes(7);
    const finalCall = mockCreate.mock.calls[6]?.[0];
    expect(finalCall.tools).toBeUndefined(); // tools withheld so the model can't keep looping
    expect(finalCall.messages.at(-1).content).toMatch(/don't call any more tools/);
  });

  it("falls back to a plain message if even the forced final call comes back with no text", async () => {
    const db = await seedOneCompany();
    mockCreate.mockResolvedValue(toolCallResponse("list_batches", {}));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c1"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c2"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c3"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c4"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c5"));
    mockCreate.mockResolvedValueOnce(toolCallResponse("list_batches", {}, "c6"));
    mockCreate.mockResolvedValueOnce({ content: [] }); // forced call still comes back empty

    const answer = await answerChatQuestion(db, "Keep digging forever");

    expect(answer).toMatch(/wasn't able to find/);
  });
});
