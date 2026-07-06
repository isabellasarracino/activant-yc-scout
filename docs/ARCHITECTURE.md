# Architecture

This is the living design doc. If you change how something works, update the
relevant section here in the same change — the goal is that nobody (including
future-you) has to reverse-engineer a decision from the code alone.

## Roadmap

| Phase | Delivers | Status |
|---|---|---|
| 1 | YC ingestion: batch + company metadata, founder bios | **Done** |
| 2a | Rubric definitions, triage scoring, categorization, thesis provider abstraction | **Done** |
| 2b | Deep-dive scoring (company website + live web search) | **Done** |
| 3a | Storage: repository layer, pipeline orchestrator, persistence | **Done** |
| 3b | REST API endpoints + chat/RAG over stored evidence | **Done** |
| 4a | Frontend: batch dashboard + expandable rubric cards | **Done** |
| 4b | Frontend: chat UI | **Done** (this drop) |
| 5 | Automation: scheduled ingestion, deployment config, historical backfill | Next |

Each phase is independently reviewable and testable rather than one large
drop — see the project README for what's concretely shipped so far.

## Data sources

Covered in detail in [DATA_SOURCES.md](DATA_SOURCES.md). Short version:
bulk batch/company metadata comes from a free, daily-refreshed mirror of
YC's own search index (not scraped by us directly); founder bios come from
fetching each company's own YC profile page directly.

## Founder extraction

`src/lib/yc/companyPage.ts` sends the fetched YC profile page to Claude
(Haiku — this is a structuring task, not an evaluative one, so the cheapest
capable model is the right call) and asks it to return a structured founders
array, rather than parsing the page with hand-written CSS selectors.

Why not selectors: we only ever see *rendered* content, not YC's actual
DOM/class names, so a selector would be written against a guess. Even a
correct guess today breaks silently the next time YC ships a redesign — a
selector either matches or it doesn't, with no partial credit and no
indication anything went wrong. Asking a model to structure the visible
content degrades gracefully instead: worst case it extracts fewer founders,
it doesn't throw a confusing runtime error, and it keeps working across
markup changes because it isn't reading markup in the first place.

The tradeoff is real and worth naming: this is slower and costs tokens per
company, compared to an instant regex match. At Haiku pricing and one call
per company, this is not the bottleneck for a 150-300 company batch — the
deep-dive scoring pass dominates cost and latency instead (it uses a bigger
model plus, sometimes, live web search) — but if that assumption ever stops
holding, this is the place to revisit it.

The fetch-with-timeout-returning-null pattern itself lives in `src/lib/http.ts`
(`fetchTextOrNull`, `stripHtmlBoilerplate`), shared between this file and
`src/lib/yc/companyWebsite.ts` (Phase 2b) so the two don't drift into
subtly different degradation behavior.

## Scoring design

**Two rubrics, computed independently for every company** — see
[RUBRIC.md](RUBRIC.md) for the full dimension-by-dimension breakdown in
plain language:
1. **Team & general interest** — is the idea interesting on its own merits,
   and is the team qualified to build it (founder-market fit, track record,
   team completeness, clarity of the pitch).
2. **Activant thesis fit** — alignment with Activant's current research
   thesis, refreshed from the Activant Research connector (see
   [Thesis source](#thesis-source) below).

**Two passes, to keep a 150-300 company batch fast and affordable:**
- *Triage pass* (`src/lib/scoring/triage.ts`) — every company, scored on
  both rubrics from YC metadata + founder bios already gathered during
  ingestion. No external website fetch, no live web search. Cheap and fast
  enough to run for a whole batch without a second thought. Purpose: sort
  the batch and decide who gets a deep dive.
- *Deep-dive pass* (`src/lib/scoring/deepDive.ts`) — only companies that
  clear a bar on triage (or that a user explicitly asks about). Adds the
  company's own website (`fetchCompanyWebsite`, same graceful-degradation
  pattern as the Phase 1 YC-page fetch: null/inaccessible rather than a
  throw) and gives the model a capped web-search tool (`max_uses: 4`) for
  open-ended supplementary research, rather than us hardcoding a fixed list
  of searches to run.

**Why deep-dive needed a different call shape, not just a flag on triage:**
triage forces `tool_choice: {type: "tool", name: "record_score"}` — a
single guaranteed-structured response. Deep-dive can't force that, because
forcing the tool on the first turn would prevent the model from searching
*before* answering. So deep-dive leaves tool choice open and instead runs a
small outer loop: check whether the response includes a `record_score`
call; if not, push the turn back with an explicit nudge and try again, up
to a turn cap. In the common case this resolves in one round trip anyway —
Anthropic's web_search tool resolves multiple search rounds automatically
within a single request — the loop exists specifically for the case where
the model finishes without ever calling `record_score`.

**Not yet live-tested:** this whole file was built and unit-tested against
a mocked Anthropic client (no API key in the environment this was built
in). The multi-turn nudge path in particular is implemented per documented
server-tool behavior, not verified against a real response. First live run
is worth watching closely for: (1) whether the common case really does
resolve in one round trip as expected, (2) whether the nudge message
reliably gets a `record_score` call on retry, (3) actual per-company
latency/cost, to sanity-check the `MAX_OUTER_TURNS` and `max_uses` values
chosen here.

Running deep-dive scoring for a whole batch through the **Message Batches
API** (async, ~half the per-token cost of live calls, supports web
search/fetch tool use in batch requests) instead of sequential live calls
is still open — see [Automation](#automation).

**Unreachable/slow company websites:** the product requirement is explicit —
score from the YC page alone and note that the site couldn't be reached,
rather than blocking or skipping the company. `fetchCompanyWebsite`
(`src/lib/yc/companyWebsite.ts`) returns `{accessible: false, note}` rather
than throwing on a bad status, a timeout, *or* a response that came back
but was almost empty (most often an unrendered JS-only page) — that last
case matters because "technically reachable but no real content" should be
treated the same as unreachable for scoring purposes, not scored as if an
empty string were meaningful evidence. `scoreDeepDive` carries
`websiteAccessible`/`websiteCheckNote` through to its result either way.

## Categorization

Every company gets both scores. It's assigned to exactly **one** primary
category — whichever score is stronger relative to a qualifying bar — never
both, per the product requirement. If it's genuinely strong on the other axis
too, that's recorded as `secondaryTag: true` rather than a second listing, so
the information isn't lost but the two lists stay clean. Companies that clear
neither bar get `primaryCategory: null` and simply don't show up in either
list (they're still stored and still answerable via chat/search).

The exact qualifying bar (a fixed score threshold vs. a percentile within the
batch) is a Phase 2 decision once there's real scored data to calibrate
against — a fixed threshold picked before seeing a single real score is a
guess.

## Rubric transparency

Every score is a composite of named, individually-scored dimensions with a
written rationale each (`CompanyScore.rubricBreakdown`), not just a single
opaque number — this is what makes the scoring auditable rather than a black
box, and mirrors the "compact score, click for the full scorecard" pattern
already used in Activant's Phase II investment memos, adapted for seed-stage
evidence instead of a data room.

## Storage

**Two layers, on purpose.** `src/lib/db/prismaLike.ts` defines `PrismaLike`
— a hand-written interface covering exactly the operations the repository
layer (`src/lib/db/repository.ts`) needs — rather than every repository
function importing `PrismaClient` from `@prisma/client` directly. Two
reasons, one general and one specific to how this got built:

- General: it keeps the repository testable with a plain object (see
  `tests/fixtures/fakeDb.ts`, an in-memory implementation of `PrismaLike`
  used across the storage/pipeline tests) and makes the actual dependency
  surface explicit rather than "all of Prisma."
- Specific: `@prisma/client`'s real generated types don't exist until `npx
  prisma generate` has run, and that command needs a schema-engine binary
  from `binaries.prisma.sh` — confirmed directly, by running it, to be a
  host outside this sandbox's network allowlist. This is independent of
  Prisma's newer Rust-free "driver adapter" client mode (which the schema
  now uses — `engineType = "client"` in the generator block, `@prisma/adapter-pg`
  wired up in `src/lib/db/client.ts`): that mode removes the *runtime* query
  engine binary, which is a real, worthwhile improvement regardless of this
  sandbox's constraints, but the `prisma generate` *CLI command itself*
  still needs the schema engine to parse the `.prisma` file and produce
  types, and that part isn't avoidable by switching client modes.

Practically: everything in this codebase except `src/lib/db/client.ts` was
fully typechecked and tested here, against `PrismaLike` and the in-memory
fake. `client.ts` — the one file that imports `@prisma/client` directly —
is the sole exception; run `npm run db:generate` once, with real internet
access, and it resolves with no code changes needed, since a real generated
`PrismaClient` satisfies `PrismaLike` structurally.

**Upsert semantics worth knowing:**
- Batches and companies are keyed by slug (human-derivable, stable across
  re-ingests), not by an opaque ingestion-run ID — re-running ingestion on
  a batch updates existing rows rather than creating duplicates.
- Founders are deleted and recreated on every company upsert rather than
  diffed in place. Re-ingesting a company is infrequent (once per
  batch-check, not once per chat question), and a founder list rarely
  changes shape in a way worth diffing — delete+recreate is simpler and
  can't drift into a half-updated state. Revisit if founder-level history
  ever matters.
- `upsertScore` only touches `Company.websiteAccessible`/`websiteCheckNote`
  when a `website` argument is passed — triage calls omit it entirely, so a
  triage-only re-score can never clobber a real deep-dive website result
  with "not checked."

**`runBatchPipeline`** (`src/lib/pipeline/`) is the one function that wires
ingestion → triage → (conditionally) deep-dive → persistence together, used
by `scripts/run-pipeline.ts` now and intended for the scheduled job in
Phase 5 — the point is that ingestion/scoring/storage logic lives in
exactly one place regardless of what triggers it (a CLI today, a cron job
later, potentially a manual "re-score this one company" action from the
frontend after that).

**REST API endpoints and the chat/RAG layer** (Phase 3b, this drop) read
from this storage via a few more repository functions —
`listAllCompaniesWithRelations` (added this phase, for chat/search that
need to reason across every batch, not one at a time) alongside the
existing `getCompanyBySlug`, `listCompaniesInBatch`, and
`categorizeForDisplay`. See [Chat / Q&A](#chat--qa) below for how those get
used, and `src/app/api/` for the endpoints themselves.

## REST API

Three read-only endpoints (`src/app/api/`), all returning plain
JSON-serializable DTOs (`src/lib/api/serialize.ts`) rather than raw DB rows
(`Date` → ISO string, internal-only fields dropped):

- `GET /api/batches` — every ingested batch.
- `GET /api/batches/[batch]` — one batch's companies, grouped into
  `teamGeneral` / `thesisFit` / `unranked` via the same
  `categorizeForDisplay` the storage layer already uses, so a company
  showing up in two lists isn't a bug that can independently creep in at
  the API layer. Each company is the **compact** shape: name, one-liner,
  both composite scores, category — enough to render a collapsed rubric
  card for an entire 150-300 company batch without shipping every
  dimension rationale for every company up front.
- `GET /api/companies/[slug]` — one company's **full** shape: everything
  compact has, plus founders (with bios) and the complete per-dimension
  rubric breakdown with rationales. This is the "click to expand" fetch —
  a frontend rubric card (Phase 4) calls this on click rather than the
  batch endpoint bundling full detail for every company upfront.

`POST /api/chat` is the one non-read-only-in-the-REST-sense endpoint, but
it doesn't write to the database either — see [Chat / Q&A](#chat--qa).

All four handlers wrap their body in try/catch and return `{ error:
string }` with a 4xx/5xx status rather than letting an unhandled rejection
surface as a raw 500 — a missing batch/company slug is a 404 with a
specific message, not a generic failure.

## Frontend

**4a (batch dashboard + rubric cards) is built; 4b (chat UI) is next.**
Client components (`src/components/dashboard/`) calling the REST API from
the browser via `src/lib/api/client.ts` — no server-side data fetching in
the page components themselves, keeping one clear boundary: REST API
reads the database, frontend reads the REST API. `BatchDashboard`
defaults to the most recently synced batch (`GET /api/batches` already
comes back newest-first) and lets the user switch via a dropdown, which
re-fetches client-side; there's no separate route per batch yet (see
"not done" below).

**Compact-by-default, expand-on-click** is implemented literally as
described in the REST API section: `CompanyCard` renders the compact
shape it's handed, and only calls `GET /api/companies/[slug]` the first
time it's expanded, caching the result in local state so re-collapsing
and re-expanding doesn't refetch.

**Design direction:** an "analyst's ledger," not a generic SaaS dashboard
or a marketing site — deliberately not the cream+terracotta or
near-black+neon palettes AI-generated frontends default to. A cool paper
background, ink-dark text, and two accent colors (muted teal for Team &
General Interest, ochre/gold for Activant Thesis Fit) that are
functional, not decorative — they're how a category reads at a glance
across a grid of dozens of cards. A serif carries company names/headings
(the same institutional-memo register `docs/RUBRIC.md` and the Phase II
IC memo comparison already established); a monospace is reserved
specifically for *scores*, so a number reads as a measured data point the
moment your eye lands on it. The one deliberately memorable element is
`ScoreBars` (`src/components/dashboard/ScoreBars.tsx`): both rubric axes
always shown together as twin bars, with whichever axis is primary
rendered solid and the other muted — encoding "this is what qualified it"
structurally rather than just showing one collapsed number.

Fonts load via a `<link>` in `layout.tsx`, not `next/font/google` —
`next/font` fetches font files at *build* time, and this project was
built in a sandbox whose network allowlist doesn't include
`fonts.gstatic.com`. A runtime `<link>` has no build-time dependency and
falls back to a real system-font stack (defined in `globals.css`) if the
link is ever slow or blocked.

**Not yet live-tested against a real browser.** There's no headless
browser available in the sandbox this was built in (installing one would
need a binary download from a host outside the network allowlist, same
shape of constraint as the Prisma schema-engine binary in
[Storage](#storage)), so there's no actual screenshot to point to.
Verification here took a different, still-real form: `next build`
compiles cleanly, and every component is tested with React Testing
Library against a real DOM (`jsdom`) with the API client mocked —
`tests/frontend/`, 20 tests covering loading/empty/error states, batch
switching, and the expand-and-cache behavior of `CompanyCard`. This is a
genuine behavioral check, just not a visual/pixel one — the first real
run in an actual browser is worth a deliberate look, particularly at
responsive behavior below the card grid's `minmax(320px, 1fr)` breakpoint
and whether the Google Fonts link ever visibly flashes unstyled text.

**Not done in 4a, left for 4b or later:**
- ~~The chat UI itself (`POST /api/chat` has no frontend yet).~~ Done in 4b, see below.
- Deep-linkable batch URLs (e.g. `/batches/summer-2026`) — batch
  switching today is client-side state, not a route change, since nothing
  in the requirements demanded a shareable per-batch URL yet. Revisit if
  that turns out to matter.
- Loading skeletons are plain text ("Loading companies…") rather than
  shaped placeholder cards — fine for an internal tool at this stage, easy
  to upgrade later without touching the data layer.

**Ranking display (fixed after 4a shipped):** `categorizeForDisplay`
already sorted each category descending by its qualifying score — that
was true since Phase 3a and has a repository test proving it
("sorts each group by strongest score, descending") — but the dashboard
didn't show that ordering was meaningful, just a list. `CompanyGrid` now
takes a `rank` prop: when set, each card gets a numbered badge (`#1`,
`#2`, …) and the section gets a "Ranked highest score first" caption.
The component deliberately does not re-sort anything itself — it trusts
the order the API already gives it, so the display logic can't silently
drift from `categorizeForDisplay`'s actual sort. Only the two qualifying
categories show a rank; `unranked` doesn't, since companies there aren't
meaningfully ordered against each other by a qualifying score.

Also fixed at the same time: raw setup errors like "DATABASE_URL is not
set" surfaced verbatim to whoever opens the page, which reads like a
crash rather than a known "this isn't configured yet" state.
`friendlyError()` in `BatchDashboard.tsx` reframes the couple of known
cases (`DATABASE_URL`, missing Anthropic API key) in plainer language
while still showing the technical detail in parentheses for whoever's
doing the actual setup.

## Chat UI (Phase 4b)

`src/app/chat/page.tsx` + `src/components/chat/ChatPanel.tsx`. A plain
labeled-transcript layout (small uppercase "You" / "Scout" / "Error"
row labels, a colored left border per role) rather than rounded chat
bubbles — kept in the same "analyst's ledger" visual language as the
dashboard (same tokens from `globals.css`) instead of introducing a
second, more consumer-app aesthetic just for this one page.

Conversation state lives entirely in the browser (a `useState` array),
sent back to `POST /api/chat` as the `history` param on every request —
there's no server-side session to persist it in yet, and the endpoint's
`history` field existed since Phase 3b specifically for this. Empty
state shows three example prompts (clicking one sends it immediately)
rather than a blank box, on the same "empty screen is an invitation to
act" reasoning as the dashboard's empty-batch state. A failed request
appends an inline error row rather than clearing or blocking the
conversation, so one failed message doesn't cost the whole thread.

Reachable from the dashboard via an "Ask Scout →" link in the header,
and back via "← Dashboard" — two pages, not stitched into one, since a
full-height chat transcript and a card grid want different page shapes
and there's no shared state between them that would justify forcing
them into one view.

**Not yet live-tested**, same as `answerChatQuestion` itself
(docs/ARCHITECTURE.md#chat--qa) and the rest of the frontend
(no headless browser in this sandbox — see above): tested with React
Testing Library + jsdom (`tests/frontend/ChatPanel.test.tsx`, 8 tests)
covering sending, history accumulation across turns, the error path,
input disabling while a request is in flight, and example-prompt
clicks.

## Thesis source

Rubric 2 reads from whatever `ThesisProvider` is configured (`src/lib/thesis/`)
— the scoring code (`triage.ts`) takes a `ThesisSnapshot` and doesn't know or
care which provider produced it. Two exist today:

- **`ManualThesisProvider`** (default, working now) — reads
  `docs/thesis/current.md`. Currently holds a placeholder built from
  Activant's public materials; replace its content with the real thesis
  whenever convenient, no code change needed.
- **`McpThesisProvider`** (structurally complete, **not yet live-tested**) —
  pulls from the **Activant Research** MCP connector using the current
  (2025-11-20) MCP connector API. Two open items before this can actually
  run: (1) auth — a standalone server has to hold its own credential for the
  connector via `ACTIVANT_RESEARCH_MCP_TOKEN`, unlike Claude.ai or an
  Artifact, which broker that handshake for you; whether the fastmcp.app
  connector issues one is unconfirmed. (2) the MCP connector's request
  shape changed recently (old `mcp-client-2025-04-04` header + nested tool
  config → new `mcp-client-2025-11-20` header + `{type: "mcp_toolset"}` in
  `tools`) — this file uses the current shape as of this writing, but check
  the docs again if this sat unused for a while before going live.

Switch providers by passing a different `ThesisProvider` implementation into
the scoring call — there's no flag or config to thread through beyond that.

## Chat / Q&A

Answers are generated by giving Claude **read-only query tools over the
stored data** (`src/lib/chat/tools.ts`) and letting it decide what to call
— a RAG pattern over our own database, not live web research, and not a
fixed intent-classifier or embeddings/vector search. See
`src/lib/chat/queryTools.ts` for why: a batch is 150-300 companies and only
a handful of batches are in play at once, so an in-memory filter/sort scan
is fast enough that a vector index would be solving a problem that doesn't
exist yet at this data volume.

Four tools: `list_batches` (resolve a display name to a batch id, or see
what's ingested), `search_companies` (name/one-liner/tag substring match,
optionally scoped to a batch), `list_top_companies` (ranks by whichever
score axis is stronger, or one specific axis, for "what's the best
company" style questions), and `get_company` (full detail — founders, full
rubric breakdown with rationales — once a specific company is identified).
This is what makes loosely-phrased questions ("what's interesting in the
new batch," "tell me about that fintech founder") work as well as specific
ones — the retrieval is a normal function call, and Claude's job is
deciding which to call and then answering from what came back, which it's
good at regardless of phrasing.

`src/lib/chat/answer.ts` runs the outer loop: call the model with the four
tools available; if it asks for a tool call, run it and feed the result
back; repeat until it answers in plain text or `MAX_TOOL_TURNS` (6) is
hit, in which case one final call is made with tools withheld to force a
plain-text answer from whatever's already been gathered, rather than
erroring out. This mirrors `scoreDeepDive`'s outer-loop-plus-nudge shape
(docs/ARCHITECTURE.md#scoring-design) but adapted: deep-dive nudges the
model to call the same tool it already had; chat instead caps total
back-and-forth and forces a final answer, since an unbounded chat tool
loop is a latency/cost problem a scoring pass isn't.

Historical batches work identically once ingested/scored — there's no
separate "history mode." A company that hasn't cleared either category bar
(`primaryCategory: null`) is still fully searchable and answerable; it
just doesn't appear in either headline list.

**Not yet live-tested:** like `scoreDeepDive`, this was built and
unit-tested against a mocked Anthropic client (`tests/chatAnswer.test.ts`)
— no API key in the environment this was built in. Watch, on the first
real run: whether `MAX_TOOL_TURNS` is generous/stingy enough in practice
for a real multi-step question, and whether the forced-final-turn fallback
ever actually triggers.

The REST endpoint is `POST /api/chat` (`src/app/api/chat/route.ts`),
validated with `zod`: `{ message: string, history?: {role, content}[] }` →
`{ answer: string }`. `history` exists now so a future frontend chat UI
(Phase 4) can carry prior turns; nothing today populates it except a
caller choosing to.

## Automation (Phase 5 — not yet built)

Nothing in a Claude conversation or Artifact keeps running once the session
ends, so "checks YC on its own and alerts you" has to live outside Claude
entirely. Plan: a scheduled **GitHub Actions workflow** (not a Vercel cron
hitting a serverless function) runs the ingest → triage → deep-dive pipeline
directly against the production database on a fixed interval. Actions is the
right tool here specifically because it doesn't have the request-timeout
ceiling a serverless function does, and scoring 150-300 companies can
legitimately take a while. The Next.js app itself stays purely read-side:
frontend + chat API querying the database, no ingestion logic living in a
request handler.

## Testing philosophy

Tests run entirely offline against fixture data captured from a real,
successful fetch (`tests/fixtures/`) — see the git history / commit that
introduced each fixture for the date it was captured. This means:
- Tests never depend on YC's site or the mirror being up, so a broken build
  always means a real bug, not a flaky network call.
- Fixtures can silently drift from reality as YC evolves their data shape.
  Treat a test failure that traces back to a fixture assumption as a signal
  to go pull a fresh sample, not just a signal to update the assertion.
- Anything that calls the Anthropic API is tested by mocking the SDK client
  and asserting on how we handle its response (parsing, error handling) —
  not by asserting on what Claude actually says, which needs a live key and
  isn't a "does our code work" question anyway.
