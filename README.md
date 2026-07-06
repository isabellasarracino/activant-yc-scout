# Activant YC Scout

Watches new Y Combinator batches, scores every company against two criteria —
(1) general quality/interest and team strength, (2) fit with Activant's
research thesis — and answers questions about any YC company or batch, past
or present.

**Status: Phase 4b of 5 — frontend complete (dashboard + chat UI).**
Ingestion, scoring, persistence, the REST API, chat/RAG, the batch
dashboard, and the chat UI are all done. Only scheduled automation
(Phase 5) is left — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for
the full roadmap.

## What's here right now

- `prisma/schema.prisma` — the full data model (batches, companies, founders,
  scores, thesis versions), using Prisma's Rust-free "driver adapter" client
  mode (no native query-engine binary at runtime).
- `src/lib/yc/` — pulls batch + company data from a daily-refreshed mirror
  of YC's own data, enriched with founder bios pulled from each company's
  own YC profile page, plus (`companyWebsite.ts`) a fetcher for the
  company's own external site used in deep-dive scoring.
- `src/lib/scoring/` — the two rubrics (`rubric.ts`), the shared
  tool/result-building logic (`scoreTool.ts`), the fast triage scorer
  (`triage.ts`), the deep-dive scorer (`deepDive.ts`, adds the company
  website + a live web-search tool), and the categorization tie-break logic
  (`categorize.ts`). See [docs/RUBRIC.md](docs/RUBRIC.md) for the rubric in
  plain language.
- `src/lib/thesis/` — a `ThesisProvider` abstraction with two
  implementations: a working file-based one (`manualProvider.ts`, backed by
  [docs/thesis/current.md](docs/thesis/current.md)) and an MCP-connector-based
  one (`mcpProvider.ts`, structurally complete but not yet live-tested — see
  docs/ARCHITECTURE.md#thesis-source for what's left to confirm).
- `src/lib/db/` — the storage layer: a hand-written `PrismaLike` interface
  (`prismaLike.ts`), repository functions for batches/companies/founders/scores
  (`repository.ts`), and the real Prisma + driver-adapter wiring
  (`client.ts` — see docs/ARCHITECTURE.md#storage for the one thing that
  needs `prisma generate` run before it compiles).
- `src/lib/pipeline/runBatchPipeline.ts` — the single function tying
  ingestion, both scoring passes, and persistence together.
- `src/lib/chat/` — the chat/Q&A layer: `queryTools.ts` (search, top-companies,
  full-detail, list-batches — pure DB queries, no Anthropic dependency),
  `tools.ts` (the Anthropic tool schemas + dispatcher), and `answer.ts` (the
  tool-calling loop that lets Claude decide what to look up before
  answering). No embeddings/vector search — see queryTools.ts for why an
  in-memory scan is the right call at this data volume.
- `src/lib/api/serialize.ts` — plain JSON-safe DTOs for the REST layer
  (compact vs. full company shape, batch summary).
- `src/app/api/` — the REST + chat endpoints: `GET /api/batches`,
  `GET /api/batches/[batch]`, `GET /api/companies/[slug]`, `POST /api/chat`.
  Read-only by design; ingestion/scoring stays CLI/cron-driven, never
  triggered from a request handler.
- `src/components/dashboard/` — the batch dashboard frontend (Phase 4a):
  `BatchDashboard` (top-level, fetches batches + selected batch detail),
  `CompanyCard` (compact by default, lazily fetches full rubric detail on
  expand), `ScoreBars` (the twin-axis score visual), `CategoryBadge`,
  `BatchSwitcher`, `CompanyGrid` (also shows a `#1, #2, …` rank badge and
  a "ranked highest score first" caption — the underlying sort was always
  there via `categorizeForDisplay`, this just makes it visible). All
  client components calling the REST API via `src/lib/api/client.ts` —
  see docs/ARCHITECTURE.md#frontend for the design direction.
- `src/components/chat/ChatPanel.tsx` + `src/app/chat/page.tsx` — the
  chat UI (Phase 4b): a plain labeled transcript (not chat bubbles),
  example prompts on an empty conversation, conversation history kept in
  browser state and sent to `POST /api/chat` each turn. See
  docs/ARCHITECTURE.md#chat-ui-phase-4b.
- `scripts/` — CLIs for ingestion (`ingest-batch.ts`), dry-run scoring
  without a database (`score-batch.ts`), and the full persisted pipeline
  (`run-pipeline.ts`).
- `tests/` — 153 tests: real captured YC data and mirror fixtures
  (`tests/fixtures/`), an in-memory fake database for storage-layer
  tests, a mocked Anthropic client for scoring/chat call shapes, mocked
  `Request`/DB-client calls for the API routes (`tests/api/`), and React
  Testing Library + jsdom for every frontend component (`tests/frontend/`)
  — see docs/ARCHITECTURE.md#frontend for why there's no actual browser
  screenshot to point to yet.

## Quick start

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY and DATABASE_URL
npm test                # runs offline, against fixtures and an in-memory fake DB — no keys needed
npm run ingest -- "Summer 2026" --fast   # real network call, needs internet
npm run score -- "Summer 2026" --limit=10 --out=results.json   # real API calls, no DB needed
npm run db:generate      # once — needs DATABASE_URL and real internet access
npm run pipeline -- "Summer 2026" --limit=10   # real API calls + writes to your database
npm run dev              # starts the app; the REST/chat endpoints below need DATABASE_URL set
```

Once `npm run dev` is running and a batch has been ingested/scored:

```bash
curl http://localhost:3000/api/batches
curl http://localhost:3000/api/batches/summer-2026
curl http://localhost:3000/api/companies/florin
curl -X POST http://localhost:3000/api/chat \
  -H "content-type: application/json" \
  -d '{"message": "what is the best thesis-fit company in the new batch?"}'
```

`--fast` on `ingest` skips the per-company founder-page fetch (YC metadata
only). `--limit` caps how many companies get processed — useful for a cheap
smoke test before running a whole 150-300 company batch. `score` is a
dry run (prints/saves JSON, no database); `pipeline` does the same work but
persists it.

One thing to watch closely the first time `score` runs for real: the
deep-dive pass (`src/lib/scoring/deepDive.ts`) mixes a live web-search tool
with a custom scoring tool in a way that was built and unit-tested against
a mocked API client, not a live one — see
[docs/ARCHITECTURE.md#scoring-design](docs/ARCHITECTURE.md#scoring-design)
for exactly what to check on that first run. The chat endpoint
(`src/lib/chat/answer.ts`) is in the same boat — its tool-calling loop is
unit-tested against a mocked client, not yet exercised against a live
response. The frontend (`src/components/dashboard/`, `src/components/chat/`)
has the equivalent gap for a different reason: there's no headless
browser available in the sandbox this was built in, so it's tested with
React Testing Library against jsdom rather than an actual rendered
browser — worth an actual look once `npm run dev` is pointed at a real
database, especially on a narrow/mobile screen.

Note: this sandboxed environment I built it in can't reach `ycombinator.com`
or the mirror API itself (its outbound network is locked to package
registries), so `npm run ingest` was verified to fail cleanly with a clear
network error here rather than run end-to-end. Everything it depends on
*was* fetched live and verified during development (see `tests/fixtures/` for
the real captured data) — it just couldn't be run as a live CLI from inside
that sandbox. It will run normally on your machine, in CI, or once deployed.

## Where the data comes from

Short version: a free, daily-refreshed community mirror of YC's own search
index for batch/company metadata, plus a direct fetch of each company's own
YC profile page for founder bios. Full reasoning, and what the fallback is
if either ever breaks, in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Tech choices, briefly

- **Next.js + TypeScript**, frontend and API routes in one deployable app —
  simplest path to "a website," one Vercel project.
- **Postgres via Prisma** — you already have Supabase connected, which is a
  natural fit; any Postgres host works.
- **Claude API** for extraction, scoring, and chat; the **Message Batches
  API** specifically for scoring a full batch of 150-300 companies
  asynchronously at half the per-token cost, rather than live/blocking calls.
- The scheduled "check YC for new companies" job runs as a **GitHub Actions
  cron**, not a Vercel serverless function — batch-scoring a large batch can
  run long, and Actions doesn't have the timeout constraints a web request
  handler does. See [docs/ARCHITECTURE.md#automation](docs/ARCHITECTURE.md#automation).

Each of these is a default I picked to keep moving rather than block on a
question. Vercel is now confirmed as the deployment target; the rest are
still open to change if you'd rather do something differently.

## Before this can actually run for real

Everything is tested against mocks/fixtures/an in-memory fake DB the way
the real things would behave, so none of this blocked building — but
`npm run pipeline` (the persisted version) genuinely needs #1 and #2 below
to do anything:

1. **An Anthropic API key** (console.anthropic.com) — for scoring, founder
   extraction, and chat.
2. **A Postgres database** — Supabase (already connected) or Vercel
   Postgres both work as-is with the schema in `prisma/schema.prisma`. Set
   `DATABASE_URL`, then run `npm run db:generate` once.
3. **A GitHub repo**, since Vercel deploys from Git — this project is
   already a git repo with a clean commit history; create an empty repo and
   `git remote add` + `git push` whenever you're ready.
4. **Clarity on the Activant Research connector's auth** for live thesis
   data (see docs/ARCHITECTURE.md#thesis-source) — not blocking, since
   `ManualThesisProvider` works today with no external auth at all.
