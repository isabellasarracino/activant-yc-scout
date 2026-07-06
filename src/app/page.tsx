import Link from "next/link";
import { BatchDashboard } from "../components/dashboard/BatchDashboard";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px 64px" }}>
      <header style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 700,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Activant YC Scout
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-muted)" }}>
            Every company scored on Team &amp; General Interest and Activant Thesis Fit — click a card for the full rubric.
          </p>
        </div>
        <Link
          href="/chat"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "8px 14px",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Ask Scout →
        </Link>
      </header>

      <BatchDashboard />
    </main>
  );
}
