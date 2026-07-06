import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Activant YC Scout",
  description: "Monitors new Y Combinator batches and scores companies against Activant's evaluation criteria.",
};

/**
 * Fonts load via a <link>, not next/font/google — next/font fetches font
 * files at *build* time, and this project was built in a sandbox whose
 * network allowlist doesn't include fonts.gstatic.com. A runtime <link>
 * has no build-time dependency and degrades to the system-font fallback
 * stack in globals.css if it's ever slow to load. See
 * docs/ARCHITECTURE.md#frontend.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
