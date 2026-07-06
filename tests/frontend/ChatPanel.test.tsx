// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "../../src/lib/api/client";

const mockPostChatMessage = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/api/client")>("../../src/lib/api/client");
  return { ...actual, postChatMessage: mockPostChatMessage };
});

const { ChatPanel } = await import("../../src/components/chat/ChatPanel");

// jsdom doesn't implement scrollIntoView; ChatPanel calls it on every
// message update purely as a UX nicety, so stub it rather than mocking
// the whole DOM API surface.
beforeEach(() => {
  mockPostChatMessage.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ChatPanel", () => {
  it("shows example prompts when the conversation is empty", () => {
    render(<ChatPanel />);
    expect(screen.getByText(/strongest thesis-fit company/)).toBeInTheDocument();
  });

  it("sends the typed message, shows it immediately, then shows the reply", async () => {
    mockPostChatMessage.mockResolvedValueOnce("Florin leads on thesis fit this batch.");
    const user = userEvent.setup();
    render(<ChatPanel />);

    await user.type(screen.getByPlaceholderText("Ask a question…"), "who's the best fit?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("who's the best fit?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Florin leads on thesis fit this batch.")).toBeInTheDocument());
    expect(mockPostChatMessage).toHaveBeenCalledWith("who's the best fit?", []);
  });

  it("clears the input after sending", async () => {
    mockPostChatMessage.mockResolvedValueOnce("Answer.");
    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText("Ask a question…") as HTMLInputElement;

    await user.type(input, "a question");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(input.value).toBe("");
  });

  it("sends accumulated history on the second message, not just the latest one", async () => {
    mockPostChatMessage.mockResolvedValueOnce("First answer.");
    mockPostChatMessage.mockResolvedValueOnce("Second answer.");
    const user = userEvent.setup();
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText("Ask a question…");

    await user.type(input, "first question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("First answer.")).toBeInTheDocument());

    await user.type(input, "second question");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(mockPostChatMessage).toHaveBeenLastCalledWith("second question", [
        { role: "user", content: "first question" },
        { role: "assistant", content: "First answer." },
      ])
    );
  });

  it("shows an error row rather than crashing or losing the conversation when the request fails", async () => {
    mockPostChatMessage.mockRejectedValueOnce(new ApiError("Anthropic API key not set", 500));
    const user = userEvent.setup();
    render(<ChatPanel />);

    await user.type(screen.getByPlaceholderText("Ask a question…"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Anthropic API key not set")).toBeInTheDocument());
    expect(screen.getByText("hello")).toBeInTheDocument(); // prior message still shown
  });

  it("does not send an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    render(<ChatPanel />);
    await user.type(screen.getByPlaceholderText("Ask a question…"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(mockPostChatMessage).not.toHaveBeenCalled();
  });

  it("clicking an example prompt sends it immediately", async () => {
    mockPostChatMessage.mockResolvedValueOnce("Here are the founders.");
    const user = userEvent.setup();
    render(<ChatPanel />);

    await user.click(screen.getByText("Tell me about the founders in this batch."));

    expect(mockPostChatMessage).toHaveBeenCalledWith("Tell me about the founders in this batch.", []);
    await waitFor(() => expect(screen.getByText("Here are the founders.")).toBeInTheDocument());
  });

  it("disables the input while a request is in flight", async () => {
    let resolvePromise: (value: string) => void = () => {};
    mockPostChatMessage.mockReturnValueOnce(new Promise((resolve) => (resolvePromise = resolve)));
    const user = userEvent.setup();
    render(<ChatPanel />);

    await user.type(screen.getByPlaceholderText("Ask a question…"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByPlaceholderText("Ask a question…")).toBeDisabled();
    resolvePromise("done");
    await waitFor(() => expect(screen.getByPlaceholderText("Ask a question…")).not.toBeDisabled());
  });
});
