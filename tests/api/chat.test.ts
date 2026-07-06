import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAnswerChatQuestion = vi.fn();
vi.mock("../../src/lib/db/client", () => ({ getDb: () => ({}) }));
vi.mock("../../src/lib/chat/answer", () => ({ answerChatQuestion: mockAnswerChatQuestion }));

const { POST } = await import("../../src/app/api/chat/route");

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    mockAnswerChatQuestion.mockReset();
  });
  it("passes message and history through and returns the answer", async () => {
    mockAnswerChatQuestion.mockResolvedValueOnce("Florin is the strongest thesis-fit company in Summer 2026.");

    const response = await POST(
      jsonRequest({ message: "What's the best thesis-fit company?", history: [{ role: "user", content: "hi" }] })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.answer).toBe("Florin is the strongest thesis-fit company in Summer 2026.");
    expect(mockAnswerChatQuestion).toHaveBeenCalledWith(
      expect.anything(),
      "What's the best thesis-fit company?",
      [{ role: "user", content: "hi" }]
    );
  });

  it("works with no history provided", async () => {
    mockAnswerChatQuestion.mockResolvedValueOnce("Sure.");
    const response = await POST(jsonRequest({ message: "hello" }));
    expect(response.status).toBe(200);
    expect(mockAnswerChatQuestion).toHaveBeenCalledWith(expect.anything(), "hello", undefined);
  });

  it("returns 400 for an empty message rather than calling the model", async () => {
    const response = await POST(jsonRequest({ message: "" }));
    expect(response.status).toBe(400);
    expect(mockAnswerChatQuestion).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing message field", async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 400 for a malformed JSON body rather than throwing", async () => {
    const badRequest = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });

  it("returns 500 with a message rather than an unhandled rejection if the chat layer throws", async () => {
    mockAnswerChatQuestion.mockRejectedValueOnce(new Error("Anthropic API key not set"));
    const response = await POST(jsonRequest({ message: "hello" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/Anthropic API key/);
  });
});
