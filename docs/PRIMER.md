# Primer: Activant YC Scout — continue this project

## How to use this

1. Start a new chat.
2. Attach the project files — ideally the whole `activant-yc-scout` folder/zip, or at minimum `docs/ARCHITECTURE.md`, `docs/RUBRIC.md`, `docs/DATA_SOURCES.md`, and `prisma/schema.prisma`.
3. Paste this whole file as your first message (or attach it alongside the code — either works).
4. First ask: "Read the attached project, especially the docs/ folder, then tell me what you understand and confirm you're ready to continue with [whatever phase you want next]." Let it demonstrate it's actually absorbed the context before it starts writing code.
5. Sanity check: the real repo has 19 commits and 235 passing tests as of this writing (see "Current build status" below). If a fresh `git log` or `npm test` in the new chat shows meaningfully less than that, the upload is probably incomplete — ask before assuming this primer is out of sync with the code.

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
| Tech stack | Next.js (App Router) + TypeScript, Prisma (classic binary engine — see the engine-choice row below) + Postgres, OpenRouter (see the model-provider row below), Vitest | One deployable app, one language throughout. |
| Prisma engine | **Classic binary Query Engine**, not the newer WASM "client" engine + driver adapter | Reverted after the user's actual first Vercel deployment hit a real, still-open Prisma bug (`query_compiler_bg.wasm` not bundled by Next.js's file tracing on Vercel). See docs/ARCHITECTURE.md#storage. Don't switch back to the WASM engine mode without checking whether that upstream bug has actually been fixed — it wasn't a theoretical risk, it broke the real deployment. |
| Categorization qualifying bar | **Removed entirely** — every scored company gets a primary category (stronger axis wins, ties to thesis_fit), none left unranked | Explicit, direct user feedback after seeing the first 10 real-scored companies live: "I don't want any companies to be unranked, they should all be ranked in descending order." `secondaryTag` keeps its own independent 6.5 threshold so it stays meaningful. See docs/ARCHITECTURE.md#categorization. Don't reintroduce a hide-below-threshold behavior without re-confirming with the user — this was a deliberate reversal of the original design, not an oversight. |
| Local script env loading | `dotenv/config` imported at the top of the three CLI scripts (`ingest-batch.ts`, `score-batch.ts`, `run-pipeline.ts`) | Added once the user needed to run the pipeline repeatedly from the Codespace terminal — typing `DATABASE_URL=... ANTHROPIC_API_KEY=... npm run pipeline ...` inline every time was error-prone (they hit shell quoting issues with special characters in their password). A `.env` file (gitignored) now just works. |
| Scheduled ingestion | **GitHub Actions cron**, not a Vercel serverless function | Scoring 150-300 companies can run long; Actions has no request-timeout ceiling the way a serverless function handler does. Not yet built (Phase 5). |
| Build approach | **Phased, checkpointed delivery** — working, tested code at each step, not one giant drop | Has worked well; keep doing this. Sub-phase further (e.g. 2a/2b, 3a/3b) whenever a phase has a natural seam, rather than cramming unrelated complexity into one drop. |
| Git | Repo already `git init`'d with clean, real commits (see below) | Not yet pushed to GitHub — user's call on timing, no rush, no dependency on it for continued building. |
| Chat/RAG approach | **Query tools over Postgres** (`search_companies`, `get_company`, `list_top_companies`, `list_batches`), not embeddings/vector search | Built in Phase 3b. Batch sizes (150-300 companies, a handful of batches at a time) make an in-memory filter/sort fast enough that a vector index solves a problem that doesn't exist yet; Claude's own tool-choice judgment handles vague phrasing as well as or better than a fixed intent-classifier would. Revisit only if historical backfill pushes the corpus into the tens of thousands of rows. |
| Frontend visual direction | **"Analyst's ledger"** — cool paper background, ink-dark text, teal (Team & General Interest) + ochre/gold (Thesis Fit) as functional category colors, serif for names/headings, monospace reserved for scores specifically | Built in Phase 4a (`src/app/globals.css`). Deliberately not the cream+terracotta or near-black+neon palettes AI-generated frontends default to. Don't restyle piecemeal — if the direction needs to change, change the tokens in `globals.css` and it propagates, rather than overriding colors per-component. |
| Frontend data flow | Client components fetch the REST API (`src/lib/api/client.ts`), not direct server-side DB calls from page components | Keeps one clear boundary: REST API reads the database, frontend reads the REST API. No mixing. |
| Chat UI shape | **Dedicated `/chat` page**, not a slide-over panel on the dashboard | Built in Phase 4b. Simpler, and a full-height transcript wants a different page shape than a card grid; nothing shares state between them that would justify forcing one view. Reachable via an "Ask Scout →" link from the dashboard. Revisit only if the user specifically wants them merged. |
| Pipeline error handling | **Per-company, not all-or-nothing** — one company's scoring failure is caught, logged, and skipped; the run continues | Changed after the real Summer 2026 batch run (62 companies) crashed on company #4 and, under the old all-or-nothing behavior, would have thrown away 3 already-scored (already-paid-for) companies and never attempted the remaining 58. `runBatchPipeline` returns `{processed, failed, failedCompanies}`; re-running the same command afterward is safe (upsert-based, no duplicates). See docs/ARCHITECTURE.md#scoring-design. |
| AI provider | **OpenRouter** (`https://openrouter.ai/api/v1`, OpenAI-compatible), not Anthropic directly | User's explicit, deliberate decision after hitting an Anthropic "credit balance too low" error mid-batch-run. Claude *offered* the lower-risk fix first (Anthropic's own Auto-Reload billing feature, which directly solves "ran out of credits" with zero risk to anything working) — the user considered it and still wanted OpenRouter, for reasons beyond just that one error. Respected as a real decision, not second-guessed after the fact. See docs/ARCHITECTURE.md#model-provider. `src/lib/ai/openrouter.ts` is the one shared client every call goes through now. |
| Deep-dive web search | **Dropped entirely**, not replicated | Anthropic's server-side `web_search` tool (what deep-dive used for live supplementary research) has no equivalent on OpenRouter's standard endpoint. Explicit user decision, offered as one of three options (drop it / keep deep-dive on a direct Anthropic key / try OpenRouter's own web-search feature untested) — user picked "drop it." This is a real, acknowledged quality regression for the deep-dive pass specifically, not a neutral simplification — don't lose sight of that if scoring quality ever gets questioned. See docs/ARCHITECTURE.md#model-provider and #scoring-design. |
| Dashboard company list | **One combined list, ranked by total score** (team + thesis), not two separate category lists | Explicit user decision after a full batch's worth of ranked companies existed to actually look at: two lists made it hard to compare a strong thesis-fit company against a strong team-and-general one at a glance. `CategoryBadge` (which axis is primary) still shows per card — this changed display grouping, not categorization itself. `rankCompaniesForDisplay` (renamed from `categorizeForDisplay`) in `src/lib/db/repository.ts`; `GET /api/batches/[batch]` now returns `{ ranked, unranked }`. Chat's `list_top_companies` "any" ranking was updated to match (combined score, not max-of-two) for consistency between dashboard and chat answers. See docs/ARCHITECTURE.md#categorization. |
| Unranked messaging | Explicit reason shown ("Scout hasn't been able to look into these companies yet"), not a bare list | Direct user request: "if it must be unranked, it should be denoted that the scout was unable to look into the company." Since the qualifying-bar removal, "unranked" only ever means "no CompanyScore row yet" (not-yet-scored or failed), so one honest, generic explanation covers every real case without needing to track/display a specific per-company failure reason (that's a possible future enhancement, not done — would need a schema field to persist why a company failed). |
| Website-triggered evaluation | **Built, then generalized** from "just the single newest batch" to "every batch from Summer 2026 onward, each with its own evaluate action" | First built narrow per explicit user request. User then asked for it to cover every batch since Summer 2026 (not the full 2022+ history they'd separately declined), with a per-batch button and safe re-triggering as any batch grows. `EARLIEST_TRACKED_BATCH` in `src/lib/yc/mirror.ts` is the one place this scope is defined. `GET /api/yc/latest-batch` was fully replaced by `GET /api/yc/batches` (plural) — don't look for the old endpoint, it's gone, not deprecated-but-kept. See docs/ARCHITECTURE.md#website-triggered-evaluation. |
| Scoring resilience, round 2 | **Retry + deep-dive fallback**, not just "log and skip" | Direct user request: "when evaluating any company, they should all work on the first try... there should be no unranked companies... the user shouldn't have to run a batch multiple times." A failed triage call now retries once, then falls back to a full deep-dive attempt (a differently-shaped call that might succeed where triage didn't); if deep-dive is the one that fails after triage already succeeded, the good triage score is used rather than nothing. `src/lib/retry.ts` is the shared retry helper. The only way a company still ends up unranked is if *both* triage and deep-dive fail even after retries — an honest limit (a truly broken API can't be retried around), not a gap left unaddressed. See docs/ARCHITECTURE.md#scoring-design. |
| Category badge sizing | Short labels ("Team & General" / "Thesis Fit"), not the full official rubric names, on the card itself | Direct user request: "the team&general interest flag needs to be made smaller so that all of the cards on the website are the same size." The full names differed enough in length to wrap the badge/score row differently depending on which category a card landed in, making otherwise-identical cards render at inconsistent heights. Full names preserved as a `title` tooltip, not dropped entirely. |
| Re-running a growing batch | **Skips already-scored companies by default** (`force`/`--rescore` to override); website re-trigger guard changed from a permanent block to a 5-minute cooldown | Direct user question: "as the batch grows... will Scout look at the additional companies?" Previously, re-running would re-score *everyone*, wasting API cost and risking silently changing an already-reviewed score (models aren't perfectly deterministic run to run). See docs/ARCHITECTURE.md#scoring-design. ~~Known remaining gap~~ **resolved in the very next request**: the user asked for (and got) a per-batch evaluate/refresh UI — see the "Website-triggered evaluation" row above. |

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

**235 tests passing, `tsc --noEmit` clean, `next build` succeeds**, as of the last commit. Full file map:

```
src/lib/ai/          openrouter.ts (shared client + forced-tool-call helper — everything routes through this now except mcpProvider.ts)
src/lib/yc/          mirror.ts, companyPage.ts, companyWebsite.ts, ingest.ts, types.ts
src/lib/scoring/     rubric.ts, scoreTool.ts, triage.ts, deepDive.ts, categorize.ts, format.ts, types.ts
src/lib/retry.ts     withRetries() — shared retry helper, used by the pipeline's triage/deep-dive fallback logic
src/lib/thesis/      types.ts, manualProvider.ts, mcpProvider.ts (still direct-Anthropic, inactive)
src/lib/db/          types.ts, prismaLike.ts, repository.ts, client.ts
src/lib/pipeline/    runBatchPipeline.ts
src/lib/chat/        queryTools.ts, tools.ts, answer.ts
src/lib/api/         serialize.ts, client.ts
src/components/dashboard/  BatchDashboard.tsx, BatchSwitcher.tsx, CompanyCard.tsx, CompanyGrid.tsx, ScoreBars.tsx, CategoryBadge.tsx, EvaluateBatchBanner.tsx, EvaluationProgress.tsx
src/components/chat/       ChatPanel.tsx
src/lib/github/       dispatch.ts (GitHub Actions workflow-dispatch helper, for website-triggered evaluation)
src/app/             globals.css, layout.tsx, page.tsx, chat/page.tsx, api/batches/route.ts, api/batches/[batch]/route.ts, api/companies/[slug]/route.ts, api/chat/route.ts, api/yc/batches/route.ts, api/batches/evaluate/route.ts
.github/workflows/   score-batch.yml (runs the pipeline on GitHub Actions — manual dispatch or website-triggered)
src/lib/http.ts      (shared fetch-with-timeout / HTML-cleaning helpers)
scripts/             ingest-batch.ts, score-batch.ts, run-pipeline.ts
prisma/schema.prisma
docs/                ARCHITECTURE.md, RUBRIC.md, DATA_SOURCES.md, PRIMER.md, thesis/current.md
tests/               33 files, 235 tests — tests/fixtures/ has real captured YC data + an in-memory fake DB; tests/api/ exercises route handlers directly; tests/frontend/ uses React Testing Library + jsdom for every dashboard + chat component (no real browser available in this sandbox — see Known gaps)
```

**Rubric, compactly** (full dimension descriptions + anchors in `docs/RUBRIC.md`):
- *Team & General Interest*: founder-market fit (25%), founder track record (25%), team completeness (15%), idea quality (20%), execution signal (15%)
- *Activant Thesis Fit*: sector alignment (30%), business model fit (25%), research-theme alignment (25%), category potential (20%)
- Categorization: every scored company gets a category — stronger axis wins (ties go to `thesis_fit`); no qualifying-bar exclusion anymore (see the Decisions table). `secondaryTag: true` means the non-primary axis independently clears its own 6.5/10 bar.

## Known gaps — reset by the OpenRouter migration, read this before assuming anything is "verified"

**Important context**: earlier in this project's history, several of these
items got confirmed working against a real Vercel deployment, a real
Supabase database, and a real Anthropic key (the pipeline actually scored
companies from the live Summer 2026 batch; the REST API and frontend
served real data to a real browser). **Then the AI provider was switched
to OpenRouter** (see the Decisions table above and
docs/ARCHITECTURE.md#model-provider). Every file that talks to an AI
model was rewritten for that switch. That means the *scoring logic itself*
(rubrics, categorization, composite math) is still proven against real
data, but the *plumbing that calls the model* is unverified again, for a
new reason. Don't conflate "this was verified before" with "this is
verified now" for anything AI-call-related.

1. **`McpThesisProvider`** (`src/lib/thesis/mcpProvider.ts`) — still unverified, unaffected by the OpenRouter switch (it deliberately stayed on direct Anthropic — see file comment). Structurally complete, unit-tested against a mocked API response, never called for real. Two open items: (a) auth — a standalone server needs its own credential for the Activant Research connector (`ACTIVANT_RESEARCH_MCP_TOKEN`); whether the fastmcp.app-hosted connector issues one is unconfirmed. (b) the MCP connector API shape itself — verified current via web search during Phase 2a; re-verify against `docs.claude.com` before assuming that's still current if it's been a while.
2. **`scoreTriage` and `scoreDeepDive`** (`src/lib/scoring/triage.ts`, `deepDive.ts`) — **`scoreTriage` confirmed working live**: a real `npm run pipeline -- "Summer 2026" --limit=3` run against OpenRouter scored 3 real companies successfully (all via the triage path) — the model slug (`anthropic/claude-sonnet-5`), the forced-tool-call request shape, and the response-parsing in `callForcedTool` all held up on a real call. `scoreDeepDive` specifically (the website-enriched pass, triggered only when triage clears the deep-dive bar) has not yet been independently confirmed post-migration — none of the first 3 companies necessarily triggered it. Worth checking the live data for a `pass: "deep_dive"` row to confirm that path specifically, though the underlying call shape is identical to triage's now (see docs/ARCHITECTURE.md#scoring-design), so the risk here is low.
3. **`src/lib/db/client.ts`** — **resolved and verified live**, unaffected by the OpenRouter switch (database access has nothing to do with the AI provider). Uses Prisma's classic binary engine after the WASM engine hit a real Vercel bundling bug — confirmed working via the user's live site successfully querying the real database. See docs/ARCHITECTURE.md#storage.
4. Scoring/extraction/chat models are OpenRouter slugs (`anthropic/claude-sonnet-5`, `anthropic/claude-haiku-4.5`), overridable via `OPENROUTER_SCORING_MODEL` / `OPENROUTER_EXTRACTION_MODEL` / `OPENROUTER_CHAT_MODEL`. **The scoring slug is now confirmed correct** (a real `npm run pipeline --limit=3` run succeeded). The extraction slug (`anthropic/claude-haiku-4.5`, used for founder extraction) and chat slug haven't been independently confirmed — they're the same model family/naming pattern that just worked, so low risk, but not literally the same verified call.
5. **`answerChatQuestion`** (`src/lib/chat/answer.ts`) — **unverified again, new cause**, same story as scoring: previously the live chat page was confirmed to render and show error states correctly in a real browser, but nobody had asked it a real question with a working key before the provider switch. Now rewritten for OpenRouter's message/tool_calls shape (`{role: "tool", tool_call_id, content}` per call, versus Anthropic's `tool_result` content blocks) — unit-tested against a mocked `openai` client, not a real response. This is the thing most worth testing first once there's a working `OPENROUTER_API_KEY`, since it's the most user-visible.
6. **REST API routes** (`src/app/api/`) — **resolved and verified live**, unaffected by the OpenRouter switch except `/api/chat`, which inherits gap #5 above (the route itself just calls `answerChatQuestion`, no independent risk).
7. **Frontend** (`src/components/dashboard/`, `src/components/chat/`) — **substantially verified live** for the dashboard (real scored companies rendered correctly in a real browser at the live URL); the chat page's *rendering* is confirmed but a real answer flowing through it end-to-end isn't, pending gap #5. Separately, no headless browser exists in the sandbox this was built in, so component-level testing is React Testing Library + jsdom, not literally a rendered browser — still true, unrelated to the provider switch.
8. **Pipeline resilience** (`runBatchPipeline.ts` catching per-company failures, `scoreTool.ts`'s malformed-input validation, `triage.ts`/`deepDive.ts`'s truncated-response guards) — the happy-path reporting is confirmed live (the real `--limit=3` run correctly printed "Done — 3 companies attempted, 0 failed"). The actual failure-handling path (a company genuinely failing and the run continuing past it) hasn't been observed live since the OpenRouter switch — the original incident and the fix's tests both predate it. Still provider-agnostic in principle.
9. **Website-triggered evaluation** (`src/lib/github/dispatch.ts`, `.github/workflows/score-batch.yml`, `GET /api/yc/batches`, `POST /api/batches/evaluate`, `EvaluateBatchBanner`, `EvaluationProgress`) — built per direct user request, entirely unverified against the real GitHub API (mocked `fetch` in tests only). Specific things to check on first real use: whether the GitHub PAT's permissions are sufficient, whether the workflow file is actually found on the deployed repo's default branch (the `ref: "main"` in `dispatch.ts` needs to match — if the repo's default branch is actually called something else, this needs updating), and whether `findBatchesFrom()`/`findLatestBatch()`'s season-name parsing holds up against whatever the mirror actually calls future batches (tested against real fixture data showing Winter/Spring/Summer/Fall, but a genuinely novel season name would fall back to "unparseable = oldest," silently failing to detect a new batch rather than crashing — worth knowing about even though it's a safe failure mode). The endpoint was renamed from `GET /api/yc/latest-batch` (deleted, not deprecated) to `GET /api/yc/batches` when this was generalized to cover every batch from Summer 2026 onward, each with its own evaluate/refresh action — the earlier "no re-check UI" gap noted in the Decisions table is resolved.
10. **Skip-already-scored pipeline behavior** (`runBatchPipeline`'s default skip logic, `POST /api/batches/evaluate`'s 5-minute cooldown replacing the old permanent block) — unit-tested thoroughly (15 tests in `tests/pipeline.test.ts` covering skip/force/mixed-new-and-old scenarios), but not yet exercised against a real growing batch. Worth confirming on the next real Summer 2026 re-run: that already-scored companies are genuinely skipped (check the CLI's "N already had a score and were skipped" summary line) and that any new companies since the last run get scored normally.
11. **Retry + deep-dive fallback resilience** (`src/lib/retry.ts`, `runBatchPipeline`'s `scoreAndPersistOne`) — unit-tested thoroughly (dedicated tests for: triage retries once and succeeds, triage fails entirely and deep-dive recovers, deep-dive fails and the existing triage score is used instead, both fail and the company is genuinely marked failed) but never exercised against a real flaky/failing OpenRouter response — the original incident this all traces back to (a malformed `record_score` call) happened on direct Anthropic, before the provider switch. Worth watching on a large real batch run: whether retries actually help in practice against OpenRouter's specific failure modes, and whether the "no unranked companies" goal holds up for real, not just in mocked tests.

## What the user still needs to do (not blocking, but real)

- ~~Get an Anthropic API key~~ — done, but **no longer what the deployed app needs** — see next item.
- ~~Get an OpenRouter API key~~ — done, confirmed working live for scoring.
- ~~Set `DATABASE_URL`~~ — done (Supabase free tier). Important nuance learned the hard way: Supabase's **direct connection** string (`db.[ref].supabase.co:5432`) is IPv6-only and unreachable from both Vercel and the Codespace — use the **Session pooler** string for one-off commands (`prisma db push`, local pipeline runs) and the **Transaction pooler** string (with `?pgbouncer=true` appended) for the deployed app's `DATABASE_URL` in Vercel.
- ~~Push the repo to GitHub~~ — done.
- ~~Deploy to Vercel~~ — done and confirmed fully working end-to-end.
- **New, for website-triggered evaluation**: create a GitHub Personal Access Token (fine-grained, scoped to just this repo, "Actions: Read and write" permission) and set `GITHUB_TOKEN` + `GITHUB_REPOSITORY` in Vercel's environment variables. Also add `DATABASE_URL` and `OPENROUTER_API_KEY` *again*, separately, as GitHub Actions repository secrets (repo Settings → Secrets and variables → Actions) — not reused from Vercel's copies, since `.github/workflows/score-batch.yml` runs on GitHub's infrastructure. Not done as of this writing — check whether it's happened before assuming the "Evaluate this batch" button works.
- Confirm chat works with a real question against OpenRouter — still open (see Known Gap #5).
- Find out whether the Activant Research MCP connector issues a standalone API credential — still open, not blocking.

## Recommended next step: verify what's newly unverified, then Phase 5

Several things built across this session have never touched the real world:
1. **Chat with a real question** — the scoring path is confirmed live; chat isn't yet.
2. **Website-triggered evaluation** ("Evaluate this batch" button, now generalized to every batch from Summer 2026 onward with its own evaluate/refresh action) — the user has confirmed the GitHub PAT + repository secrets are set up correctly (they reported all setup steps worked); what hasn't happened yet is an actual click-through to confirm the whole GitHub Actions dispatch → polling → progress bar → completion loop works end to end for real, for both a first-time evaluation and a refresh of a grown batch.
3. **The retry + deep-dive fallback resilience** (`src/lib/retry.ts`, `runBatchPipeline`) — thoroughly unit-tested, never watched handle a real flaky OpenRouter response.

Only after these are confirmed does Phase 5 (scheduled automation) make
sense — it would reuse the same GitHub Actions secrets and very likely the
same `dispatchScoreBatchWorkflow`/workflow file, just triggered by a
`schedule` instead of a button click. Building that before the on-demand
version has been watched working once would mean automating something
unverified.

The user also asked about a bigger feature — picking any historical YC
batch (2022+) from the dropdown — and explicitly chose to hold off on it
after hearing the real scope (a full historical browser, not just current
batches, with real one-time cost to backfill ~1,500-2,000 historical
companies). **That's still declined, not built** — the website-triggered
evaluation feature that did get built is deliberately narrower (Summer
2026 onward only, per `EARLIEST_TRACKED_BATCH`). Don't conflate the two or
assume the bigger one snuck in as part of this work.



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
- The user checked Phase 4a live in their own browser (via a GitHub Codespace, since they don't have Node installed locally) and flagged that the score-based ordering wasn't visually obvious on the page — the sort itself was already correct and tested since Phase 3a, just not shown. That's the `rank` prop on `CompanyGrid` (see docs/ARCHITECTURE.md#frontend; the underlying sort function has since been renamed `rankCompaniesForDisplay` and changed to combined-score, single-list ranking — see the Decisions table). Worth remembering the user is non-technical: they can run `npm test`/`npm run build`/`npm run dev` by following exact copy-pasted steps, but explanations and any future ask for them to verify something should stay in plain language, not assume familiarity with terminals, errors, or web dev concepts.
- **The deployment itself happened in this session, live, with the user, via a GitHub Codespace** (their choice, since they don't have Node/git installed locally) — not something to re-plan from scratch next time, it already happened. Two real snags worth knowing about if debugging anything deployment-related:
  1. Browser drag-and-drop from their OS file explorer into the Codespace's file panel silently corrupted files twice — once scrambling `package.json`'s content with a test file's content, once flattening the whole folder structure into hundreds of loose files (including raw `.git` internals). The reliable method that worked: upload the single `.zip` file only, then `unzip` it *inside* the Codespace terminal. If handing this project to the user again as a zip, lead with that method rather than drag-and-drop.
  2. Their first `git push` failed because `.gitignore` didn't make it into their working copy (an instruction to "skip anything starting with a dot" during manual file selection accidentally excluded it too), so `node_modules` got committed and exceeded GitHub's 100MB file limit. Fixed with `git rm -r --cached node_modules`, recreating `.gitignore`, amending the commit, and a force-push. If their repo history looks unusual, this is why.
  3. The Vercel deployment succeeded (build-wise) but every database call failed at runtime with `query_compiler_bg.wasm` ENOENT — this is the Prisma engine issue described in the Decisions table above and docs/ARCHITECTURE.md#storage, fixed by switching off the WASM "client" engine. This was caught on the user's actual live deployment, not in any sandbox here — a real first-deployment bug, exactly the kind of thing "not yet live-tested" warnings throughout this primer exist to flag.
- The user's database is Supabase free tier, their Anthropic key has ~$5 free trial credit (no card needed, phone-verified), and Vercel is on the free Hobby plan — all confirmed working for this project's expected usage level. No paid tier needed yet for anything. **OpenRouter's own free-credit situation is unconfirmed** — unlike the Anthropic $5 trial credit (verified via web search), whether OpenRouter offers something similar wasn't checked before the user went ahead with the switch; don't assume it mirrors Anthropic's policy.
- **Supabase connection strings, the hard-won version**: Supabase gives you three connection string variants, and using the wrong one for the wrong context is the single biggest thing that went wrong in this deployment. Direct connection (`db.[ref].supabase.co:5432`) is IPv6-only on the free tier — unreachable from Vercel serverless functions AND from a GitHub Codespace, both of which are IPv4-only in this setup. Session pooler (`aws-0-[region].pooler.supabase.com:5432`) works from both and is what to use for one-off commands like `prisma db push` or running the pipeline manually from a terminal. Transaction pooler (same host, port 6543, needs `?pgbouncer=true` appended) is what the deployed app itself should use as its runtime `DATABASE_URL` in Vercel. If a future session needs to touch database connectivity, start here rather than re-debugging from scratch.
- Score display format: every score (composite or per-dimension) is out of 10, shown as "7/10" or "6.8/10" (`src/lib/scoring/format.ts`) — added because a bare "7.0" on the page didn't communicate the scale. If new score displays get added anywhere, use `formatScore()`, don't reformat inline.
