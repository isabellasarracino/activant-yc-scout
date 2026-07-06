import Link from "next/link";
import { ChatPanel } from "../../components/chat/ChatPanel";

export default function ChatPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 64px" }}>
      <header style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Ask Scout
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-muted)" }}>
            Answers come from ingested, scored companies — not live web research.
          </p>
        </div>
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink-muted)",
            textDecoration: "none",
          }}
        >
          ← Dashboard
        </Link>
      </header>

      <ChatPanel />
    </main>
  );
}
