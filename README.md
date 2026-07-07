# Activant YC Scout

Watches new Y Combinator batches, scores every company against two criteria —
(1) general quality/interest and team strength, (2) fit with Activant's
research thesis — and answers questions about any YC company or batch, past
or present.

**Status: all core phases complete and deployed live, plus one feature beyond
the original roadmap.** Ingestion, scoring, persistence, the REST API,
chat/RAG, the batch dashboard, and the chat UI are all built and confirmed
working end-to-end against a real Vercel deployment, real Supabase database,
and (originally) a real Anthropic key. Every AI call has since switched to
route through **OpenRouter** instead of Anthropic directly (see
[docs/ARCHITECTURE.md#model-provider](docs/ARCHITECTURE.md#model-provider))
— **the scoring path is now confirmed working live** on the new provider; chat
and deep-dive specifically are still pending their first live confirmation.
Beyond the original roadmap: the dashboard can now trigger evaluation of a
brand-new YC batch directly from a button, no terminal needed (see
[docs/ARCHITECTURE.md#website-triggered-evaluation](docs/ARCHITECTURE.md#website-triggered-evaluation))
— built per direct request, **not yet live-tested**. Only scheduled
automation (Phase 5) is left on the original roadmap — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full roadmap.

## What's here right now

- `prisma/schema.prisma` — the full data model (batches, companies, founders,
  scores, thesis versions), using Prisma's classic binary Query Engine
  (switched back to this after the newer WASM engine mode hit a
  still-open bundling bug on Vercel — see
  docs/ARCHITECTURE.md#storage).
- `src/lib/ai/openrouter.ts` — the shared OpenRouter client + forced-tool-call
  helper every scoring/extraction/chat call goes through (switched from
  calling Anthropic directly — see docs/ARCHITECTURE.md#model-provider for
  why, including the one real regression: deep-dive's live web search got
  dropped, an Anthropic-only capability with no OpenRouter equivalent).
- `src/lib/yc/` — pulls batch + company data from a daily-refreshed mirror
  of YC's own data, enriched with founder bios pulled from each company's
  own YC profile page, plus (`companyWebsite.ts`) a fetcher for the
  company's own external site used in deep-dive scoring.
- `src/lib/scoring/` — the two rubrics (`rubric.ts`), the shared
  tool/result-building logic (`scoreTool.ts`), the fast triage scorer
  (`triage.ts`), the deep-dive scorer (`deepDive.ts`, adds the company
  website to the same prompt shape triage uses — no live web search
  anymore), score display formatting (`format.ts`, "7/10" not "7.0"), and
  the categorization logic (`categorize.ts` — every scored company gets a
  category now, no "below the bar" exclusion). See
  [docs/RUBRIC.md](docs/RUBRIC.md) for the rubric in plain language.
- `src/lib/thesis/` — a `ThesisProvider` abstraction with two
  implementations: a working file-based one (`manualProvider.ts`, backed by
  [docs/thesis/current.md](docs/thesis/current.md)) and an MCP-connector-based
  one (`mcpProvider.ts`, structurally complete but not yet live-tested, and
  the one file still on the direct Anthropic SDK — see
  docs/ARCHITECTURE.md#thesis-source for what's left to confirm).
- `src/lib/db/` — the storage layer: a hand-written `PrismaLike` interface
  (`prismaLike.ts`), repository functions for batches/companies/founders/scores
  (`repository.ts`), and the real Prisma wiring (`client.ts` — classic
  binary Query Engine, see docs/ARCHITECTURE.md#storage for the one thing
  that needs `prisma generate` run before it compiles, and why it's not
  the newer WASM engine mode).
- `src/lib/pipeline/runBatchPipeline.ts` — the single function tying
  ingestion, both scoring passes, and persistence together. Resilient to a
  single company's scoring failure (logs it via a `"failed"` progress event
  and keeps going) rather than aborting the whole batch run — see
  docs/ARCHITECTURE.md#scoring-design for the real incident that drove this.
- `src/lib/chat/` — the chat/Q&A layer: `queryTools.ts` (search, top-companies,
  full-detail, list-batches — pure DB queries, no AI-provider dependency),
  `tools.ts` (provider-agnostic tool schemas + dispatcher), and `answer.ts`
  (the tool-calling loop, via OpenRouter, that lets the model decide what
  to look up before answering). No embeddings/vector search — see
  queryTools.ts for why an in-memory scan is the right call at this data
  volume.
- `src/lib/api/serialize.ts` — plain JSON-safe DTOs for the REST layer
  (compact vs. full company shape, batch summary).
- `src/app/api/` — the REST + chat endpoints: `GET /api/batches`,
  `GET /api/batches/[batch]`, `GET /api/companies/[slug]`, `POST /api/chat`.
  Read-only by design; ingestion/scoring stays CLI/cron-driven, never
  triggered from a request handler — except the one guarded exception
  below.
- `src/lib/github/dispatch.ts`, `.github/workflows/score-batch.yml`,
  `GET /api/yc/latest-batch`, `POST /api/batches/evaluate`,
  `src/components/dashboard/EvaluateBatchBanner.tsx` +
  `EvaluationProgress.tsx` — website-triggered evaluation: a button on the
  dashboard that scores a brand-new YC batch via GitHub Actions (real
  scoring still can't run inside a web request — see
  docs/ARCHITECTURE.md#website-triggered-evaluation for the full
  mechanism, needed setup, and why this is a deliberately narrow
  exception to "no ingestion from a request handler," not a reversal of
  it).
- `src/components/dashboard/` — the batch dashboard frontend: `BatchDashboard`
  (top-level, fetches batches + selected batch detail, one combined
  ranked list by total score — see docs/ARCHITECTURE.md#categorization for
  why this replaced an earlier two-list split), `CompanyCard` (compact by
  default, lazily fetches full rubric detail on expand), `ScoreBars` (the
  twin-axis score visual), `CategoryBadge` (still shown per card even in
  one combined list), `BatchSwitcher`, `CompanyGrid` (the `#1, #2, …` rank
  badge — the underlying sort, `rankCompaniesForDisplay`, lives in
  `src/lib/db/repository.ts`). All client components calling the REST API
  via `src/lib/api/client.ts` — see docs/ARCHITECTURE.md#frontend for the
  design direction.
- `src/components/chat/ChatPanel.tsx` + `src/app/chat/page.tsx` — the
  chat UI (Phase 4b): a plain labeled transcript (not chat bubbles),
  example prompts on an empty conversation, conversation history kept in
  browser state and sent to `POST /api/chat` each turn. See
  docs/ARCHITECTURE.md#chat-ui-phase-4b.
- `scripts/` — CLIs for ingestion (`ingest-batch.ts`), dry-run scoring
  without a database (`score-batch.ts`), and the full persisted pipeline
  (`run-pipeline.ts`).
- `tests/` — 209 tests: real captured YC data and mirror fixtures
  (`tests/fixtures/`), an in-memory fake database for storage-layer
  tests, a mocked `openai` client for scoring/chat call shapes (routed
  through OpenRouter), mocked `fetch`/`Request`/DB-client calls for the
  API routes and GitHub dispatch (`tests/api/`, `tests/githubDispatch.test.ts`),
  and React Testing Library + jsdom for every frontend
  component (`tests/frontend/`) — see docs/ARCHITECTURE.md#frontend for
  why there's no actual browser screenshot to point to yet.

## Quick start

```bash
npm install
cp .env.example .env   # fill in OPENROUTER_API_KEY and DATABASE_URL — loaded automatically by every script below
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

One thing to watch closely the first time `score` runs for real: **the
entire scoring/chat stack just switched from calling Anthropic directly to
routing through OpenRouter** (see
[docs/ARCHITECTURE.md#model-provider](docs/ARCHITECTURE.md#model-provider)
for the full story, including a real regression — deep-dive scoring's live
web search got dropped, since it's an Anthropic-only capability with no
OpenRouter equivalent). Every file that talks to OpenRouter is unit-tested
against a mocked client, same rigor as always, but none of it has hit
`openrouter.ai` for real — that domain isn't reachable from the sandbox
this was built in either. Model slugs in particular
(`anthropic/claude-sonnet-5`, `anthropic/claude-haiku-4.5` — overridable
via env vars, see `.env.example`) are the most likely thing to need a
one-line fix if a request 404s. The frontend
(`src/components/dashboard/`, `src/components/chat/`) has the equivalent
"not tested against the real thing" gap for a different reason: there's no
headless browser available in the sandbox this was built in, so it's
tested with React Testing Library against jsdom rather than an actual
rendered browser — worth an actual look once `npm run dev` is pointed at a
real database, especially on a narrow/mobile screen.

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
- **OpenRouter** (not Anthropic directly) for extraction, scoring, and chat
  — switched after hitting an Anthropic credit-balance error mid-batch-run,
  to reduce dependence on any one provider. Real tradeoff: deep-dive
  scoring's live web-search step got dropped in the switch (Anthropic-only
  capability, no OpenRouter equivalent) — see
  [docs/ARCHITECTURE.md#model-provider](docs/ARCHITECTURE.md#model-provider).
  An async batch-discount API for scoring a full batch of 150-300 companies
  at once was on the table when this was still direct-Anthropic; whether
  OpenRouter exposes an equivalent is unconfirmed and would need checking
  before relying on it.
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

1. **An OpenRouter API key** (openrouter.ai/keys) — for scoring, founder
   extraction, and chat. (An Anthropic key is only needed for the
   currently-inactive MCP thesis provider — see
   docs/ARCHITECTURE.md#model-provider.)
2. **A Postgres database** — Supabase (already connected) or Vercel
   Postgres both work as-is with the schema in `prisma/schema.prisma`. Set
   `DATABASE_URL`, then run `npm run db:generate` once.
3. **A GitHub repo**, since Vercel deploys from Git — this project is
   already a git repo with a clean commit history; create an empty repo and
   `git remote add` + `git push` whenever you're ready.
4. **Clarity on the Activant Research connector's auth** for live thesis
   data (see docs/ARCHITECTURE.md#thesis-source) — not blocking, since
   `ManualThesisProvider` works today with no external auth at all.
5. **A GitHub Personal Access Token**, only needed for the "Evaluate this
   batch" button on the dashboard (see
   docs/ARCHITECTURE.md#website-triggered-evaluation) — set `GITHUB_TOKEN`
   + `GITHUB_REPOSITORY` in Vercel, and `DATABASE_URL` +
   `OPENROUTER_API_KEY` *again* as GitHub Actions repository secrets
   (separate from Vercel's copies — the workflow runs on GitHub's
   infrastructure). Not needed if you're fine running
   `npm run pipeline` from a terminal instead.
