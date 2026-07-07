# Data sources

## Batch and company metadata: the yc-oss mirror

`src/lib/yc/mirror.ts` reads from `https://yc-oss.github.io/api/`
([source](https://github.com/yc-oss/api)), a community-maintained, MIT-licensed
mirror that pulls from YC's own public Algolia search index — the same index
that powers the filter UI on ycombinator.com/companies — via a scheduled
GitHub Actions job, and republishes it as static JSON. It is **not** an
official YC API; nothing about YC's directory is.

**Why this instead of scraping ycombinator.com/companies directly:**
- The directory page itself is client-rendered — a plain HTTP fetch of it
  returns page metadata only, no company data. Getting the real data out of
  it directly means running a headless browser or reverse-engineering YC's
  Algolia key, which is signed and rotates.
- ycombinator.com sits behind Cloudflare with rate-limiting tuned to catch
  exactly the kind of repeated, machine-paced requests a batch-ingestion job
  makes. Depending on an approach that's actively trying not to look like a
  scraper is a worse long-term bet than depending on a source that already
  did that work and republishes the result.
- Verified live on 2026-07-02: `meta.json` lists every batch back to 2005,
  including the in-progress current batch (Summer 2026 showed 54 companies
  that day, out of an eventual 150-300) — confirming batches fill in
  gradually via YC's rolling "Launches" mechanism rather than appearing all
  at once on a single day. This matters for how "check for a new batch"
  should actually behave: it's a diff against what we've already ingested
  for the current batch slug, not a one-time trigger on a known date.

**What this does *not* give us:** founder names, bios, or social links —
confirmed by checking the schema directly (also independently confirmed by
third-party scrapers of the same index — see e.g. the Apify YC-directory
listings, which note the same gap). That's why founder data has to come from
somewhere else.

**If yc-oss ever goes away or falls behind:** the fallback is a direct fetch
of `ycombinator.com/companies?batch=<Human+Batch+Name>` through a real
browser-rendering path (headless browser, or the Claude API's own web-fetch
tool, which runs server-side and isn't subject to a browser's CORS/JS
limitations) — slower and more fragile, which is exactly why it's the
fallback and not the primary path.

## Founder data: individual YC company profile pages

`src/lib/yc/companyPage.ts` fetches each company's own page directly, e.g.
`ycombinator.com/companies/florin`. Unlike the directory index, individual
company pages render fully server-side (confirmed by fetching several live —
both an old, large company and a brand-new two-person one from the current
batch rendered the same way): name, one-liner, full description, and —
critically — a "Founders" section with each founder's name, title, bio
paragraph, and (for current-batch companies especially) their LinkedIn and
Twitter URLs directly.

This means the founder bio itself is usually enough for a first-pass read on
background (prior companies, schools, notable prior work), with the LinkedIn
URL stored alongside it for anyone who wants to verify or dig further by
hand. The deep-dive scoring pass (Phase 2) supplements this with a targeted
web search per founder for anything the YC bio doesn't cover — this is public
research the same way a sharp analyst would do it by hand, not a
background-check service, and should be described to end users that way.

## Company websites (Phase 2)

Not yet implemented, but the pattern is set by `fetchCompanyPageHtml`
(return `null` on any failure — bad status, timeout, network error — rather
than throwing) and will be reused rather than reinvented: a company's own
website gets a bounded-timeout fetch during the deep-dive pass; on failure,
the company is scored from YC data alone and `websiteCheckNote` records why,
per the product requirement that a slow or unreachable company site should
never block or exclude a company from being scored.

## Historical batches

The mirror covers every YC batch back to 2005, so "ask about a past batch"
is not a separate feature or a separate code path — it's the same
`ingestBatch("Winter 2012")` call as any other batch. What's different is
*when* the ingestion runs: recent batches get ingested and scored eagerly
(so reports are "already available"); a batch from 2012 gets ingested and
scored the first time someone asks about it, then cached from then on — see
`docs/ARCHITECTURE.md` for the caching design once Phase 3 (storage) lands.
