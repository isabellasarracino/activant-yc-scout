"use client";

import { useEffect, useRef, useState } from "react";
import { postChatMessage, ApiError, type ChatMessage } from "../../lib/api/client";

type DisplayMessage = ChatMessage | { role: "error"; content: string };

const EXAMPLE_PROMPTS = [
  "What's the strongest thesis-fit company in the latest batch?",
  "Tell me about the founders in this batch.",
  "Which companies have a strong team but weaker thesis fit?",
];

/**
 * A plain research-transcript layout — labeled rows, not rounded chat
 * bubbles — to match the "analyst's ledger" direction rather than
 * introducing a second, more consumer-app visual language just for this
 * page. Conversation history is kept in local state and sent back on
 * every request (POST /api/chat's `history` param exists for exactly
 * this) since there's nowhere server-side a session lives yet.
 */
export function ChatPanel() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const history: ChatMessage[] = messages.filter((m): m is ChatMessage => m.role === "user" || m.role === "assistant");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);

    try {
      const answer = await postChatMessage(trimmed, history);
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong reaching the chat service.";
      setMessages((prev) => [...prev, { role: "error", content: message }]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)", maxHeight: 720 }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "var(--surface)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {messages.length === 0 && (
          <div>
            <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 10px" }}>
              Ask about any company or batch that's been ingested. Try one of these, or type your own question below.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => void send(prompt)}
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    color: "var(--ink)",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageRow key={i} message={m} />
        ))}

        {sending && <MessageRow message={{ role: "assistant", content: "…" }} pending />}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          disabled={sending}
          style={{
            flex: 1,
            fontFamily: "var(--font-body)",
            fontSize: 14,
            padding: "10px 12px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--ink)",
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 600,
            padding: "10px 18px",
            border: "none",
            borderRadius: 6,
            background: sending || !input.trim() ? "var(--surface-sunken)" : "var(--ink)",
            color: sending || !input.trim() ? "var(--ink-muted)" : "var(--surface)",
            cursor: sending || !input.trim() ? "default" : "pointer",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

function MessageRow({ message, pending = false }: { message: DisplayMessage; pending?: boolean }) {
  const isUser = message.role === "user";
  const isError = message.role === "error";
  const label = isUser ? "You" : isError ? "Error" : "Scout";

  return (
    <div
      style={{
        borderLeft: `3px solid ${isError ? "var(--danger)" : isUser ? "var(--line)" : "var(--team)"}`,
        paddingLeft: 12,
        opacity: pending ? 0.6 : 1,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: isError ? "var(--danger)" : "var(--ink-muted)",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: isError ? "var(--danger)" : "var(--ink)",
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
        }}
      >
        {message.content}
      </div>
    </div>
  );
}
