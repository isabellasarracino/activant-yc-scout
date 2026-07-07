# Architecture

This is the living design doc. If you change how something works, update the
relevant section here in the same change — the goal is that nobody (including
future-you) has to reverse-engineer a decision from the code alone.

## Roadmap

| Phase | Delivers | Status |
|---|---|---|
| 1 | YC ingestion: batch + company metadata, founder bios | **Done** |
| 2a | Rubric definitions, triage scoring, categorization, thesis provider abstraction | **Done** |
| 2b | Deep-dive scoring (company website) | **Done** — originally included live web search too; dropped in the OpenRouter migration, see [Model provider](#model-provider) |
| 3a | Storage: repository layer, pipeline orchestrator, persistence | **Done** |
| 3b | REST API endpoints + chat/RAG over stored evidence | **Done** |
| 4a | Frontend: batch dashboard + expandable rubric cards | **Done** |
| 4b | Frontend: chat UI | **Done** |
| — | Website-triggered evaluation: on-demand scoring for a brand-new batch, no terminal needed | **Done** — see [Website-triggered evaluation](#website-triggered-evaluation), not on the original roadmap, added per direct user request |
| 5 | Automation: scheduled ingestion, deployment config, historical backfill | Next |

Each phase is independently reviewable and testable rather than one large
drop — see the project README for what's concretely shipped so far.

## Data sources

Covered in detail in [DATA_SOURCES.md](DATA_SOURCES.md). Short version:
bulk batch/company metadata comes from a free, daily-refreshed mirror of
YC's own search index (not scraped by us directly); founder bios come from
fetching each company's own YC profile page directly.

## Model provider

**Switched from calling Anthropic directly to OpenRouter's OpenAI-compatible
endpoint** (`https://openrouter.ai/api/v1`), per explicit product decision —
not a sandbox workaround, a real choice to reduce dependence on any one
provider's credit balance running out (the immediate trigger: hitting a
"credit balance too low" error mid-batch-run). `src/lib/ai/openrouter.ts`
is the one shared client + tool-call helper every AI call in this codebase
goes through now, except `mcpProvider.ts` (see below).

**The real tradeoff this forced**: Anthropic's server-side `web_search`
tool — what the deep-dive scoring pass used to use for live supplementary
research — has no equivalent on OpenRouter's standard endpoint. Rather than
building custom search-API plumbing to replicate it, **web search was
dropped from deep-dive scoring entirely**, per explicit product decision
(the alternative — keeping deep-dive on a direct Anthropic key while
everything else moved — was considered and rejected: the user's whole
reason for switching was to not depend on Anthropic credits, so leaving
the most evaluative pass on Anthropic would have undercut the point). This
is a real quality regression worth remembering, not a wash: deep-dive
scores now rest only on YC metadata + the company's own website, not
supplementary research a human analyst doing the same job would probably
do. See [Scoring design](#scoring-design) below for what deep-dive looks
like now.

**Everything else migrated cleanly** — triage scoring, founder extraction,
and the chat feature's tool-calling loop don't depend on anything
Anthropic-specific, just ordinary forced/optional tool use, which OpenRouter
supports the same way OpenAI's own API does.

**Model slugs are env-overridable** (`OPENROUTER_SCORING_MODEL`,
`OPENROUTER_EXTRACTION_MODEL`, `OPENROUTER_CHAT_MODEL` — see `.env.example`
and `MODELS` in `openrouter.ts`) because OpenRouter's exact current slug for
a given Claude version can shift as new versions ship. Defaults
(`anthropic/claude-sonnet-5`, `anthropic/claude-haiku-4.5`) matched what was
confirmed available on OpenRouter via web search at the time this was
written — **not confirmed by an actual successful API call**, since
`openrouter.ai` isn't reachable from the sandbox this was built in either
(same shape of constraint as `binaries.prisma.sh` for Prisma). If a request
404s with "model not found," check https://openrouter.ai/models and
override via the env vars.

**Not yet live-tested — this is the biggest unverified change in the
project so far.** Every file that talks to OpenRouter (`triage.ts`,
`deepDive.ts`, `companyPage.ts`, `chat/answer.ts`, `ai/openrouter.ts`
itself) was rewritten and is unit-tested against a mocked `openai` package
client, exactly the same rigor as everything else — but none of it has
actually hit `openrouter.ai` for real. Specific things a first real run
should check, roughly in order of "how likely to actually be wrong":
1. **The model slugs are exactly right.** This is the most likely thing to
   need a one-line env-var fix.
2. **The forced-tool-call response shape matches what `callForcedTool`
   expects** — i.e. that OpenRouter's Claude routing returns
   `choices[0].message.tool_calls[0].function.arguments` as a JSON string,
   the same as OpenAI's own API, rather than something Anthropic-flavored
   leaking through.
3. **The chat tool-loop's multi-turn message shape** (assistant messages
   with `tool_calls`, followed by one `{role: "tool", tool_call_id,
   content}` message per call) round-trips correctly across several turns,
   not just one.
4. **Deep-dive quality, now that web search is gone** — worth an actual
   look at whether scores/rationales still feel grounded enough without it,
   or whether the regression matters enough to revisit (see the tradeoff
   note above).

`mcpProvider.ts` (the currently-inactive Activant Research thesis
connector) is the one file that stays on the direct Anthropic SDK — its
MCP connector beta feature has no OpenRouter equivalent, the same shape of
constraint that took web search off the table for deep-dive. This only
matters if that connector is ever activated; `ANTHROPIC_API_KEY` isn't
needed otherwise.

## Founder extraction

`src/lib/yc/companyPage.ts` sends the fetched YC profile page to a small,
fast model (this is a structuring task, not an evaluative one, so the
cheapest capable model is the right call) via the shared OpenRouter helper
(`callForcedTool`) and asks it to return a structured founders array,
rather than parsing the page with hand-written CSS selectors.

Why not selectors: we only ever see *rendered* content, not YC's actual
DOM/class names, so a selector would be written against a guess. Even a
correct guess today breaks silently the next time YC ships a redesign — a
selector either matches or it doesn't, with no partial credit and no
indication anything went wrong. Asking a model to structure the visible
content degrades gracefully instead: worst case it extracts fewer founders,
it doesn't throw a confusing runtime error, and it keeps working across
markup changes because it isn't reading markup in the first place.

The tradeoff is real and worth naming: this is slower and costs tokens per
company, compared to an instant regex match. At a small model's pricing and
one call per company, this is not the bottleneck for a 150-300 company
batch — the deep-dive scoring pass dominates cost and latency instead — but
if that assumption ever stops holding, this is the place to revisit it.

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
  ingestion. No external website fetch. Cheap and fast enough to run for a
  whole batch without a second thought. Purpose: sort the batch and decide
  who gets a deep dive.
- *Deep-dive pass* (`src/lib/scoring/deepDive.ts`) — only companies that
  clear a bar on triage. Adds the company's own website
  (`fetchCompanyWebsite`, same graceful-degradation pattern as the Phase 1
  YC-page fetch: null/inaccessible rather than a throw) to the same prompt
  shape triage uses.

**Both passes are now structurally identical** — one forced
`tool_choice`-style call to `record_score`, no multi-turn loop — since the
[OpenRouter migration](#model-provider) dropped deep-dive's live web-search
tool (an Anthropic-only capability with no equivalent there). Deep-dive
used to run as an open-ended agentic loop (search zero or more times, then
call `record_score`, with a turn-cap-and-nudge fallback for when the model
never got there) specifically *because* it needed to leave room for the
model to search before answering; once there's nothing left to search
with, forcing the tool immediately is strictly simpler and just as
correct. If a future session ever reintroduces some form of web research
(e.g. an OpenRouter-native search plugin, or custom search-API plumbing),
expect deep-dive to need the unforced multi-turn shape back.

**A real bug, hit at scale, on real data**, back when this still ran
against Anthropic directly: running the full Summer 2026 batch (62
companies) for the first time crashed on company #4 with `Cannot convert
undefined or null to object` — a malformed/incomplete `record_score` tool
call reached `buildScoreResult` with `team_general` missing entirely,
likely from the response getting truncated by hitting `max_tokens` (which
was 3000, tighter than deep-dive's 4000 at the time). Three fixes, all
still in place after the OpenRouter migration: `scoreTriage`'s token
budget raised to 4096; both `triage.ts` and `deepDive.ts` check for a
truncated finish reason and fail with a specific, diagnosable error rather
than passing a broken object downstream; `buildScoreResult`
(`scoreTool.ts`) itself validates `team_general`/`thesis_fit` are present
before touching them, for the same failure mode from any cause.

**The bigger fix, independent of root cause:** `runBatchPipeline` used to
be all-or-nothing — one company's failure aborted the entire run, which on
a 62-company batch meant losing several already-scored (and already
paid-for) companies and never attempting the rest. Each company's
score-and-persist step is now wrapped individually; a failure is logged
via a `"failed"` progress event and the run continues, returning
`{processed, failed, failedCompanies}` instead of just a count. The CLI
(`scripts/run-pipeline.ts`) prints which companies failed and why at the
end; re-running the same command afterward is safe (upsert-based, no
duplicates from re-scoring).

**Not yet live-tested (again — same shape of gap, new cause):** the
scoring logic itself was proven against real data before the provider
switch (the Summer 2026 batch actually ran, including at least one company
that completed the old web-search deep-dive path). Since the OpenRouter
rewrite, none of it has hit a real API — see
[Model provider](#model-provider) above for exactly what to watch on the
first real run.

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
category — whichever score is stronger — never both, per the product
requirement. If it's genuinely strong on the other axis too, that's recorded
as `secondaryTag: true` rather than a second listing, so the information
isn't lost but the two lists stay clean. Exact ties go to `thesis_fit` (the
more specific, more actionable signal for sourcing).

**Changed after real data**: this originally had a qualifying bar (6.5/10)
below which a company got `primaryCategory: null` and didn't appear in
either headline list — a company had to "clear the bar" to be ranked at
all. Once there was real scored data to actually look at, the user's
feedback was direct: every company should be visible and ranked, none
hidden behind a threshold. `categorize()` (`src/lib/scoring/categorize.ts`)
now always assigns the stronger axis as primary regardless of its absolute
value — a 4.0 team score still becomes `team_general` if it beats a 3.0
thesis score. `secondaryTag` keeps its own independent threshold (still
6.5, still tunable) so it stays a meaningful "also genuinely strong on the
other axis" signal rather than becoming true for nearly everyone once the
qualifying bar was removed. `primaryCategory` is still nullable in the
type/schema — that now means "not scored yet at all" (no `CompanyScore`
row), a genuinely different state from "scored, ranked, just lower," and
still renders separately (see `rankCompaniesForDisplay` /
`GET /api/batches/[batch]`'s `unranked` list, which now only ever contains
not-yet-scored companies).

**Display grouping changed too, separately from categorization itself**:
the dashboard used to show two separate lists (Team & General Interest,
Activant Thesis Fit), each sorted by its own strongest score. It's now one
combined, ranked list — sorted by `teamGeneralScore + thesisAlignScore`,
highest first — with `primaryCategory`/`secondaryTag` still shown as a
badge per card. Per explicit product decision once there was a full
batch's worth of ranked companies to look at: two separate lists made it
harder to compare a strong thesis-fit company against a strong
team-and-general one at a glance, since they never appeared side by side.
`rankCompaniesForDisplay` (`src/lib/db/repository.ts`) does this ranking;
`GET /api/batches/[batch]` returns `{ ranked, unranked }`, not the earlier
`{ teamGeneral, thesisFit, unranked }`. The chat feature's
`list_top_companies` tool was updated to match (ranks by combined score
for its default "any category" case, same as the dashboard) — see
`src/lib/chat/queryTools.ts` — so "what's the best company" means the same
thing whether asked through the dashboard or the chat.

## Rubric transparency

Every score is a composite of named, individually-scored dimensions with a
written rationale each (`CompanyScore.rubricBreakdown`), not just a single
opaque number — this is what makes the scoring auditable rather than a black
box, and mirrors the "compact score, click for the full scorecard" pattern
already used in Activant's Phase II investment memos, adapted for seed-stage
evidence instead of a data room.

Every score — composite or per-dimension — is out of 10. The frontend
displays this explicitly (`src/lib/scoring/format.ts`'s `formatScore`):
"7/10" for a whole number, "6.8/10" for a fractional one (composite scores
are weighted averages of the per-dimension scores, so fractions are common
and real — rounding them all to whole numbers would lose the distinction
between, say, a 6.8 and a 7.2). Added after the user pointed out a bare
"7.0" on the page didn't say what scale it was on.

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
  host outside this sandbox's network allowlist.

**Engine choice — reverted after hitting a real bug on first deployment.**
This project originally used Prisma's newer WASM-based "client" engine
(`engineType = "client"` + the `@prisma/adapter-pg` driver adapter), on
the theory that avoiding a native query-engine binary was strictly
better. The first real Vercel deployment hit a widely-reported, still-open
Prisma bug (as of mid-2026): the engine's `query_compiler_bg.wasm` file
doesn't get bundled correctly by Next.js's automatic file tracing on
Vercel, failing at runtime with `ENOENT: .../query_compiler_bg.wasm` on
every database call. `src/lib/db/client.ts` and `prisma/schema.prisma`
now use Prisma's classic binary Query Engine instead — the older,
far-more-battle-tested option, and what Vercel's own official Prisma
guides use — with `binaryTargets = ["native", "rhel-openssl-3.0.x"]` for
Vercel's Linux serverless runtime. The lesson generalizes: "newer and
avoids a binary" isn't automatically the safer choice for a solo
deployment target — the classic engine's maturity mattered more here than
the WASM mode's theoretical elegance.

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
- `GET /api/batches/[batch]` — one batch's companies, as `{ ranked,
  unranked }` via the same `rankCompaniesForDisplay` the storage layer
  already uses (ranked by combined score — see
  [Categorization](#categorization) for why this used to be two separate
  lists and isn't anymore). Each company is the **compact** shape: name,
  one-liner, both composite scores, category — enough to render a
  collapsed rubric card for an entire 150-300 company batch without
  shipping every dimension rationale for every company up front.
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
erroring out. Unlike `scoreDeepDive` (which forces its one tool
immediately — see [Scoring design](#scoring-design)), chat genuinely needs
an open-ended, multi-round loop, since it doesn't know upfront how many
tool calls a question will take.

Historical batches work identically once ingested/scored — there's no
separate "history mode." Every *scored* company gets a real category (see
[Categorization](#categorization) — there's no more "below the bar,
unranked" state); `primaryCategory: null` now means "not scored yet at
all," and even then the company is still fully searchable and answerable
via chat.

**Not yet live-tested:** like the rest of the scoring/chat code since the
[OpenRouter migration](#model-provider), this was built and unit-tested
against a mocked `openai` client (`tests/chatAnswer.test.ts`) — not a real
API call. Watch, on the first real run: whether `MAX_TOOL_TURNS` is
generous/stingy enough in practice for a real multi-step question, and
whether the forced-final-turn fallback ever actually triggers.

The REST endpoint is `POST /api/chat` (`src/app/api/chat/route.ts`),
validated with `zod`: `{ message: string, history?: {role, content}[] }` →
`{ answer: string }`. `history` exists now so a future frontend chat UI
(Phase 4) can carry prior turns; nothing today populates it except a
caller choosing to.

## Website-triggered evaluation

A manual, on-demand cousin of Phase 5's *scheduled* automation (below):
clicking "Evaluate this batch" on the dashboard scores a brand-new YC
batch without anyone touching a terminal. Built per explicit user
request, scoped deliberately narrow — just the single newest batch, not a
full historical browser (a much bigger "any batch since 2022" feature was
discussed and the user explicitly chose to hold off on it, precisely
because of the setup/cost this feature already needed — see the Decisions
table in docs/PRIMER.md).

**Why this can't just be an API route that runs the pipeline directly**:
scoring 150-300 companies takes far longer than a Vercel serverless
function is allowed to run. The mechanism instead:

1. `GET /api/yc/latest-batch` (`src/app/api/yc/latest-batch/route.ts`)
   checks the YC mirror directly (not our database) for the chronologically
   newest batch that exists anywhere, via `findLatestBatch()` in
   `src/lib/yc/mirror.ts` — this is what lets the dashboard say "Fall 2026
   just dropped" the moment YC starts showing companies in it, before
   anyone has ingested anything. `findLatestBatch` parses "<Season>
   <Year>" out of each display name rather than trusting the mirror's
   JSON key order (undocumented) or company count (a brand-new batch
   starts with very few companies, so "most companies" would pick the
   wrong one — confirmed with real fixture data where "Fall 2026" had 4
   companies against "Summer 2026"'s 54).
2. If that batch isn't already in our database, the dashboard shows
   `EvaluateBatchBanner` (`src/components/dashboard/EvaluateBatchBanner.tsx`).
   Clicking it calls `POST /api/batches/evaluate`
   (`src/app/api/batches/evaluate/route.ts`), which checks the batch isn't
   already evaluated (409 if it is — a lightweight guard against an
   accidental double-click or refresh triggering a second, fully
   redundant, real-money batch run) and then calls
   `dispatchScoreBatchWorkflow()` (`src/lib/github/dispatch.ts`), which
   asks GitHub's REST API to run `.github/workflows/score-batch.yml` — a
   `workflow_dispatch`-triggered job that does exactly what
   `npm run pipeline -- "<batch name>"` does locally, just running on
   GitHub's infrastructure instead.
3. The dashboard switches to `EvaluationProgress`
   (`src/components/dashboard/EvaluationProgress.tsx`), which polls
   `GET /api/batches/[batch]` (the same endpoint the normal dashboard
   uses) every 12 seconds and shows a progress bar plus an estimated time
   remaining. **Deliberately does not ask GitHub about the Actions run's
   status** — GitHub's workflow-dispatch endpoint returns `204 No Content`
   with no run ID, so there's no direct way to get "the run that was just
   created" back from the dispatch call; polling our own database for
   companies actually appearing answers the question that matters ("is
   data showing up") more directly than a proxy for it ("did GitHub say
   the job started"). "Done" is detected as "every company in the batch
   has been attempted" (`ranked.length + unranked.length >=
   expectedCompanyCount`), not "zero unranked" — a company that
   genuinely fails to score stays in `unranked` forever (see
   [Scoring design](#scoring-design)'s pipeline-resilience story), so
   waiting for zero would hang forever if anything failed.
4. The "estimated time remaining" is a real, live-updating estimate
   (elapsed time so far ÷ companies scored so far × companies remaining),
   not a fixed guess — it starts from a rough placeholder
   (`INITIAL_MS_PER_COMPANY_ESTIMATE = 8000`ms) before any real data
   exists, then replaces it with an actual observed average the moment
   the first company is scored.

**Setup this needs, beyond what was already configured** — three things,
none of which overlap with Vercel's environment variables:
- A GitHub **Personal Access Token**, fine-grained, scoped to just this
  repo, with "Actions: Read and write" permission — stored as
  `GITHUB_TOKEN` in **Vercel's** environment variables (this is what lets
  the website ask GitHub to start the job).
- `GITHUB_REPOSITORY` ("owner/repo") — also in Vercel's environment
  variables.
- `DATABASE_URL` and `OPENROUTER_API_KEY` added *again*, separately, as
  **GitHub Actions repository secrets** (repo Settings → Secrets and
  variables → Actions) — not reused from Vercel's copies, since the
  workflow runs on GitHub's infrastructure and can't read Vercel's
  environment variables.

**No access control on `POST /api/batches/evaluate`** beyond the
already-evaluated guard — anyone who can reach the deployed site can
trigger a real, paid GitHub Actions run once per not-yet-evaluated batch.
Acceptable for an internal tool passed around a small team; revisit
(Vercel deployment protection, or a shared-secret check in the route)
before this is ever exposed more broadly.

**Not yet live-tested** — same as every other first run in this project:
built and unit-tested against mocked `fetch`/database calls
(`tests/githubDispatch.test.ts`, `tests/api/latestBatch.test.ts`,
`tests/api/evaluateBatch.test.ts`, `tests/frontend/EvaluateBatchBanner.test.tsx`,
`tests/frontend/EvaluationProgress.test.tsx`), never actually hit GitHub's
real API. Watch on the first real click: whether the PAT's permissions are
sufficient (a 401/403 from GitHub means the token needs adjusting),
whether the workflow file is found on the right branch (a 404 means
checking the `ref: "main"` in `dispatch.ts` matches the actual default
branch name), and whether the progress estimate feels reasonable once
real per-company timing is visible.

## Automation (Phase 5 — not yet built)

The *scheduled*, unattended cousin of the on-demand feature above: rather
than someone noticing a new batch and clicking a button, a scheduled
**GitHub Actions workflow** (not a Vercel cron hitting a serverless
function, same reasoning as above) checks for and scores new batches
automatically on a fixed interval. Would reuse the same
`runBatchPipeline` and likely the same GitHub Actions secrets already set
up for website-triggered evaluation — the main new piece would be a
`schedule`-triggered workflow (or a second job in the existing one) that
first checks whether the latest batch has grown/changed before deciding
whether to re-run scoring, so it doesn't redundantly re-score an unchanged
batch every time it runs. The Next.js app itself stays purely read-side
otherwise: frontend + chat API querying the database, no ingestion logic
living in a request handler except the one already-guarded trigger point
described above.

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
