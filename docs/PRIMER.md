# Primer: Activant YC Scout — continue this project

## How to use this

1. Start a new chat.
2. Attach the project files — ideally the whole `activant-yc-scout` folder/zip, or at minimum `docs/ARCHITECTURE.md`, `docs/RUBRIC.md`, `docs/DATA_SOURCES.md`, and `prisma/schema.prisma`.
3. Paste this whole file as your first message (or attach it alongside the code — either works).
4. First ask: "Read the attached project, especially the docs/ folder, then tell me what you understand and confirm you're ready to continue with [whatever phase you want next]." Let it demonstrate it's actually absorbed the context before it starts writing code.
5. Sanity check: the real repo has 10 commits and 153 passing tests as of this writing (see "Current build status" below). If a fresh `git log` or `npm test` in the new chat shows meaningfully less than that, the upload is probably incomplete — ask before assuming this primer is out of sync with the code.

This primer is the orientation layer — decisions, status, and conventions. The actual detail (exact rubric wording, exact data-source reasoning, exact schema) lives in the repo's own docs and should be treated as the source of truth if anything here seems to conflict with it.

## What this is

A tool for **Activant Capital** (a growth-equity firm — commerce infrastructure, fintech/payments, e-commerce, supply chain, insurance, healthcare infra, vertical SaaS, Series B-E, $15-60M checks) that watches new Y Combinator batches and scores every company against two criteria:

1. **Team & General Interest** — is this an interesting company with a well-qualified team, independent of Activant's specific thesis.
2. **Activant Thesis Fit** — does it align with Activant's actual current research thesis.

The person building this works at Activant and wants a real, fully hosted web app, not a demo. Original hard requirements, preserved as given:

- Autonomous monitoring of new YC batches (no manual trigger required)
- A scored rubric, compact by default, expandable to full per-dimension detail on click
- Two category lists (Team & General Interest / Activant Thesis Fit) — **a company goes in exactly one, never both**, even if it qualifies for both (flag it, don't duplicate it)
- A chat/Q&A feature that handles vague, loosely-phrased questions naturally, works for any YC company or any historical batch, and can answer "what's the best/most highly ranked company" from stored data
- Fast latency — this is why scoring is split into a cheap pass for everyone and an expensive pass for only the companies worth it
- Fully hosted web app (their explicit choice over a Claude-native artifact prototype)

## Decisions already made (don't re-litigate these without a good reason)

| Decision | Choice | Why |
|---|---|---|
| Deployment target | **Vercel** | User confirmed explicitly. Hold off actually connecting/deploying until there's a real frontend worth seeing (told the user this; they agreed) — deploying an empty shell is pointless. |
| Database | **Postgres**, via Supabase or Vercel Postgres | User already has a Supabase MCP connector; either works as-is with the schema. |
| Thesis source | **Activant Research MCP connector**, user's explicit choice, with a manual-file fallback | See "Known gaps" below — the connector isn't live-wired yet. |
| Tech stack | Next.js (App Router) + TypeScript, Prisma (Rust-free/driver-adapter mode) + Postgres, Anthropic SDK, Vitest | One deployable app, one language throughout. |
| Scheduled ingestion | **GitHub Actions cron**, not a Vercel serverless function | Scoring 150-300 companies can run long; Actions has no request-timeout ceiling the way a serverless function handler does. Not yet built (Phase 5). |
| Build approach | **Phased, checkpointed delivery** — working, tested code at each step, not one giant drop | Has worked well; keep doing this. Sub-phase further (e.g. 2a/2b, 3a/3b) whenever a phase has a natural seam, rather than cramming unrelated complexity into one drop. |
| Git | Repo already `git init`'d with clean, real commits (see below) | Not yet pushed to GitHub — user's call on timing, no rush, no dependency on it for continued building. |
| Chat/RAG approach | **Query tools over Postgres** (`search_companies`, `get_company`, `list_top_companies`, `list_batches`), not embeddings/vector search | Built in Phase 3b. Batch sizes (150-300 companies, a handful of batches at a time) make an in-memory filter/sort fast enough that a vector index solves a problem that doesn't exist yet; Claude's own tool-choice judgment handles vague phrasing as well as or better than a fixed intent-classifier would. Revisit only if historical backfill pushes the corpus into the tens of thousands of rows. |
| Frontend visual direction | **"Analyst's ledger"** — cool paper background, ink-dark text, teal (Team & General Interest) + ochre/gold (Thesis Fit) as functional category colors, serif for names/headings, monospace reserved for scores specifically | Built in Phase 4a (`src/app/globals.css`). Deliberately not the cream+terracotta or near-black+neon palettes AI-generated frontends default to. Don't restyle piecemeal — if the direction needs to change, change the tokens in `globals.css` and it propagates, rather than overriding colors per-component. |
| Frontend data flow | Client components fetch the REST API (`src/lib/api/client.ts`), not direct server-side DB calls from page components | Keeps one clear boundary: REST API reads the database, frontend reads the REST API. No mixing. |
| Chat UI shape | **Dedicated `/chat` page**, not a slide-over panel on the dashboard | Built in Phase 4b. Simpler, and a full-height transcript wants a different page shape than a card grid; nothing shares state between them that would justify forcing one view. Reachable via an "Ask Scout →" link from the dashboard. Revisit only if the user specifically wants them merged. |

## Current build status

Repo name: `activant-yc-scout`. Tests genuinely passing at each commit (not just claimed):

| Phase | What it delivers | Status |
|---|---|---|
| 1 | YC ingestion — `src/lib/yc/` (mirror client, founder-page fetch + extraction) | Done |
| 2a | Rubric (`src/lib/scoring/rubric.ts`), triage scorer, categorization tie-break, thesis provider abstraction | Done |
| 2b | Deep-dive scorer — company website fetch + live web search tool | Done |
| 3a | Storage — `PrismaLike` interface, repository functions, pipeline orchestrator | Done |
| 3b | REST API endpoints (`GET /api/batches`, `GET /api/batches/[batch]`, `GET /api/companies/[slug]`) + chat/RAG (`POST /api/chat`) over stored evidence | Done |
| 4a | Frontend — batch dashboard, expandable rubric cards | Done |
| 4b | Frontend — chat UI | Done |
| 5 | Automation — GitHub Actions cron, deployment docs, historical backfill | **Not started — natural next step** |

**153 tests passing, `tsc --noEmit` clean, `next build` succeeds**, as of the last commit. Full file map:

```
src/lib/yc/          mirror.ts, companyPage.ts, companyWebsite.ts, ingest.ts, types.ts
src/lib/scoring/     rubric.ts, scoreTool.ts, triage.ts, deepDive.ts, categorize.ts, types.ts
src/lib/thesis/      types.ts, manualProvider.ts, mcpProvider.ts
src/lib/db/          types.ts, prismaLike.ts, repository.ts, client.ts
src/lib/pipeline/    runBatchPipeline.ts
src/lib/chat/        queryTools.ts, tools.ts, answer.ts
src/lib/api/         serialize.ts, client.ts
src/components/dashboard/  BatchDashboard.tsx, BatchSwitcher.tsx, CompanyCard.tsx, CompanyGrid.tsx, ScoreBars.tsx, CategoryBadge.tsx
src/components/chat/       ChatPanel.tsx
src/app/             globals.css, layout.tsx, page.tsx, chat/page.tsx, api/batches/route.ts, api/batches/[batch]/route.ts, api/companies/[slug]/route.ts, api/chat/route.ts
src/lib/http.ts      (shared fetch-with-timeout / HTML-cleaning helpers)
scripts/             ingest-batch.ts, score-batch.ts, run-pipeline.ts
prisma/schema.prisma
docs/                ARCHITECTURE.md, RUBRIC.md, DATA_SOURCES.md, PRIMER.md, thesis/current.md
tests/               26 files, 153 tests — tests/fixtures/ has real captured YC data + an in-memory fake DB; tests/api/ exercises route handlers directly; tests/frontend/ uses React Testing Library + jsdom for every dashboard + chat component (no real browser available in this sandbox — see Known gaps)
```

**Rubric, compactly** (full dimension descriptions + anchors in `docs/RUBRIC.md`):
- *Team & General Interest*: founder-market fit (25%), founder track record (25%), team completeness (15%), idea quality (20%), execution signal (15%)
- *Activant Thesis Fit*: sector alignment (30%), business model fit (25%), research-theme alignment (25%), category potential (20%)
- Categorization: qualify bar defaults to 6.5/10 (placeholder, needs calibration against real scored data eventually); if both qualify, stronger axis is primary and the other becomes `secondaryTag: true`; exact ties go to `thesis_fit`.

## Known gaps — built and tested, but not verified against the real thing

Be upfront about these if asked; don't quietly assume they're solid:

1. **`McpThesisProvider`** (`src/lib/thesis/mcpProvider.ts`) — structurally complete, unit-tested against a mocked API response, never called for real. Two open items: (a) auth — a standalone server needs its own credential for the Activant Research connector (`ACTIVANT_RESEARCH_MCP_TOKEN`), unlike Claude.ai/an Artifact which broker that automatically; whether that fastmcp.app-hosted connector issues one is unconfirmed. (b) the MCP connector API shape itself — this was verified current via web search during Phase 2a (uses `betas: ["mcp-client-2025-11-20"]` and `{type: "mcp_toolset", mcp_server_name}` in `tools`, replacing an older, now-deprecated pattern) — if it's been a while, re-verify against `docs.claude.com` before assuming that's still current.
2. **`scoreDeepDive`** (`src/lib/scoring/deepDive.ts`) — the agentic loop mixing `web_search` (`web_search_20250305`, `max_uses: 4`) with a custom `record_score` tool has never made a real API call (no key in the sandbox this was built in). Built per documented server-tool behavior. First live run: watch whether it resolves in one round trip as expected, and whether the "call record_score now" nudge reliably works if it doesn't.
3. **`src/lib/db/client.ts`** — the real Prisma + `@prisma/adapter-pg` wiring. Everything else in the storage layer is tested against a hand-written `PrismaLike` interface + an in-memory fake (`tests/fixtures/fakeDb.ts`), specifically because `npx prisma generate` needs a schema-engine binary from `binaries.prisma.sh`, which was unreachable from the sandbox this was built in (confirmed by actually running it, not assumed). This is almost certainly not a problem in a normal dev machine, CI runner, or Vercel build — just run `npm run db:generate` once with real internet access. If it somehow still fails, that's worth debugging fresh rather than assuming it's the same issue.
4. Scoring model used throughout is `claude-sonnet-5`; founder-extraction (a structuring, not evaluative, task) uses `claude-haiku-4-5-20251001`. If model names have moved on, that's a simple swap, not a design change.
5. **`answerChatQuestion`** (`src/lib/chat/answer.ts`, Phase 3b) — same story as `scoreDeepDive`: the tool-calling loop (up to 4 query tools, capped at `MAX_TOOL_TURNS = 6`) is unit-tested against a mocked Anthropic client, never called for real. First live run: watch whether 6 turns is generous/stingy for a real multi-step question, and whether the forced-final-turn-without-tools fallback (for when the cap is hit) ever actually triggers versus the model just answering normally well before then.
6. **REST API routes** (`src/app/api/`, Phase 3b) — tested by calling the exported `GET`/`POST` functions directly with constructed `Request` objects and a fake DB (`tests/api/`), and `next build` was run successfully end-to-end. Not yet hit with a real running dev server or a real Postgres-backed `getDb()` — the same `client.ts` gap as always, nothing new here.
7. **Frontend** (`src/components/dashboard/`, `src/components/chat/`, Phases 4a+4b) — no headless browser was available in this sandbox to install (same shape of network-allowlist constraint as the Prisma schema-engine binary — the browser binary download would need a host outside it), so there's no actual screenshot, just `next build` succeeding and React Testing Library + jsdom component tests (`tests/frontend/`, 33 tests: dashboard loading/empty/error states, batch switching, `CompanyCard`'s expand-and-cache behavior, rank-badge display, and the full chat panel — sending, history accumulation, the error path, input disabling). Worth a real look in an actual browser once there's a database and an Anthropic key to point `npm run dev` at — particularly responsive behavior below the card grid's `minmax(320px, 1fr)` breakpoint, whether the Google Fonts `<link>` (used instead of `next/font/google`, which needs a build-time fetch this sandbox's network allowlist doesn't support) ever visibly flashes unstyled text, and whether a real Claude response reads well in the plain-transcript chat layout.

## What the user still needs to do (not blocking, but real)

Carried forward from earlier in the build — check whether any of these have happened since:
- Get an Anthropic API key (needed to run anything for real; not needed to keep building/testing).
- Set `DATABASE_URL` (Supabase or Vercel Postgres) and run `npm run db:generate` once.
- Push the repo to GitHub whenever convenient (it's ready — clean history, `.gitignore` in place).
- Find out whether the Activant Research MCP connector issues a standalone API credential.

## Recommended next step: Phase 5 (proposed, not yet built or confirmed with the user)

Automation: a scheduled GitHub Actions workflow running the ingest → triage → deep-dive pipeline on a fixed interval against the production database (see docs/ARCHITECTURE.md#automation for the reasoning on why Actions, not a Vercel cron). Also the natural point to revisit the categorization qualify bar (currently a placeholder 6.5/10 — see "Rubric, compactly" above) once there's real scored data to calibrate against, and to do the historical batch backfill the product description mentions. Worth confirming with the user first, though — the frontend being done may shift priorities toward actually deploying to Vercel and wiring up a real database/API key over building more automation, since there's now a complete, demoable v1.

## Working conventions to keep following

- **Test against real data wherever possible.** Every "external" module so far was validated against something real — live YC/mirror data fetched during the session (Phase 1), an in-memory fake DB with real relational semantics (Phase 3a) — rather than shallow mocks alone. Mocks are for things that are genuinely unreachable in-session (no API key, no network to a given host), and that's always stated explicitly, not glossed over.
- **Update docs in the same commit as the code**, not after. `docs/ARCHITECTURE.md` explains *why*; code comments explain *why* at the point of decision too, not just what.
- **Flag what wasn't verified, specifically** — not a vague disclaimer, but exactly what to check first and why (see "Known gaps" above for the pattern to continue).
- **Deliver as a zip of the whole repo each time**, git history intact, after running the full test suite and `tsc --noEmit` and confirming both are clean.
- **Sub-phase big pieces** rather than delivering one huge drop — 2a/2b and 3a/3b happened naturally because triage vs. deep-dive, and write-path vs. read-path, are genuinely different shapes of work.
- Minimize clarifying questions once the person has already signaled direction; state assumptions and proceed, and only stop to ask when a real fork in the road would waste effort if guessed wrong.

## Context that doesn't fit anywhere else

- Activant's actual research thesis isn't wired in yet — `docs/thesis/current.md` is a **placeholder** built from Activant's public materials, clearly marked as such in the file itself. Don't treat Rubric 2 scores as meaningful until that's replaced or the MCP connector is live.
- The existing `investment-memo-phase2` skill (Activant's Phase II growth-equity IC memo format) directly inspired the "compact score, click for full scorecard" rubric-display pattern — same firm, same convention, deliberately, even though this tool covers a completely different stage of company than that memo does.
- Today's date when this primer was written: **July 6, 2026** (Y Combinator's Summer 2026 batch was the live test batch throughout, ~54 companies in progress at the time).
- The user checked Phase 4a live in their own browser (via a GitHub Codespace, since they don't have Node installed locally) and flagged that the score-based ordering wasn't visually obvious on the page — the sort itself was already correct and tested since Phase 3a, just not shown. That's the `rank` prop on `CompanyGrid` (see docs/ARCHITECTURE.md#frontend). Worth remembering the user is non-technical: they can run `npm test`/`npm run build`/`npm run dev` by following exact copy-pasted steps, but explanations and any future ask for them to verify something should stay in plain language, not assume familiarity with terminals, errors, or web dev concepts.
