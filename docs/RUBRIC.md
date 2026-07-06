# Scoring rubric

This is the human-readable version of `src/lib/scoring/rubric.ts`. If you
want to change a weight or a dimension's wording, it's simplest to edit the
code file directly and copy the change here — the two are meant to always
match; treat a mismatch as a bug.

Every company gets scored 0-10 on every dimension below, with a written,
evidence-grounded rationale for each score (never just a number) — that's
what makes a score checkable rather than a black box. The two composite
scores then run through a categorization rule (see
`docs/ARCHITECTURE.md#categorization`) that puts each company into exactly
one of the two lists, or neither if it doesn't clear the bar on either.

## Rubric 1 — Team & General Interest

*Is this an interesting company, and is this team qualified to build it?*

| Dimension | Weight | What it's asking |
|---|---|---|
| Founder-market fit | 25% | Do the founders' specific backgrounds explain why *they* are unusually positioned to win this problem? |
| Founder track record & pedigree | 25% | Prior exits, notable employers, distinguished technical/academic achievement. |
| Team completeness | 15% | Does the team cover what the business needs — build and go-to-market — or is there a gap? |
| Idea quality & differentiation | 20% | Is this a sharp, differentiated approach, or a crowded me-too? |
| Execution signal | 15% | Any visible evidence of momentum — named customers, usage/revenue figures, a real product vs. a placeholder. |

**Score anchors**, using founder-market fit as the example (every dimension
has its own version of this in the code):

- **2/10** — No visible connection between the founders' backgrounds and the problem.
- **5/10** — Generally relevant background, no specific edge in this exact space.
- **8/10** — Direct, hard-to-replicate expertise in this exact problem.

## Rubric 2 — Activant Thesis Fit

*Does this align with what Activant is actually looking for right now?*

| Dimension | Weight | What it's asking |
|---|---|---|
| Sector / vertical alignment | 30% | Is this squarely inside a current thesis vertical, adjacent, or unrelated? |
| Business model fit | 25% | Recurring, infrastructure-like, platform/marketplace dynamics vs. a one-off model. |
| Alignment with recent research | 25% | Direct connection to a specific, recently published research theme — not just the general sector list. |
| Category-defining potential | 20% | Could this become a large, durable category leader — Activant's own "escape velocity" bar? |

Rubric 2's content is refreshed from Activant's live research (see
`docs/ARCHITECTURE.md#thesis-source`) rather than fixed in code — the
*dimensions* above are stable, but what counts as "a current thesis
vertical" or "a recently published theme" updates as the thesis does.
Until the live connector is wired up, scoring runs against the placeholder
in `docs/thesis/current.md`, built from Activant's public materials — worth
a skim before trusting Rubric 2 scores for anything real.

## Why these dimensions and not others

- **No financial dimensions.** At the YC stage there's essentially never a
  public revenue, margin, or valuation figure to score against — including
  a "financials" dimension would just be scoring the same evidence
  ("execution signal") twice under a fancier name. This diverges
  deliberately from the fuller due-diligence rubric used in the Phase II
  growth-equity memo, which *is* scoring real financials — different stage,
  different evidence, different rubric.
- **Team dimensions are split into three (fit, track record, completeness)
  rather than one "team quality" score.** A single number here would hide
  the difference between "great pedigree, wrong domain" and "perfect domain
  fit, thin résumé," which are very different signals that call for
  different follow-up.
- **The categorization bar (currently 6.5/10) is a placeholder**, not a
  calibrated cutoff — see `docs/ARCHITECTURE.md#categorization` for the plan
  to tune it once there's real scored data to check it against.

## Feedback loop

If a scored company looks wrong to you, the rationale text on the relevant
dimension is where to look first — either the evidence it cited is wrong
(a bug in ingestion, worth flagging) or the *weight* placed on that evidence
seems off (a rubric-design conversation, not a bug). Worth distinguishing
the two before assuming the rubric needs to change.
