# To do

## 1. Run the dataset once over every year (1968 → today)

**Why it is not done yet:** colours, wheels and country live only on each casting's own page
(the "Versions" table). The yearly "List of YYYY Hot Wheels" pages have no colour column at all,
which is why the first dataset had colours on roughly 6% of rows. Phase 2 of the pipeline reads
the casting pages, but at one request per second it costs real time:

| Range | Casting pages | Run time |
|---|---|---|
| 2010 → today (current setting) | ~1,500 casting + ~1,200 series | ~1.5–2 h |
| 1968 → today | ~5,000 casting + ~2,200 series | ~3–4 h |

**What is set now:** scheduled monthly runs use `--castings-from 2010`, so cars released before
2010 keep their name, card code, series and number, but have no colour.

**How to do the full run:** Actions → *Refresh database* → *Run workflow*, set
**castings_from** to `1968`. It fits inside the job's time limit (currently 330 minutes).
Afterwards, leave the monthly schedule on 2010 — a full crawl every month is wasteful, because
old pages rarely change.

## 2. Speed up repeat runs

Each monthly run re-reads every casting page. The MediaWiki API can return revision ids in
batches of 50 titles (`action=query&prop=revisions`), so a committed `page → revid` cache would
let a run skip pages that have not changed, turning 30 minutes into a few. Not built yet.

## 3. Collections the yearly lists do not cover

Done, and no longer a hand-kept list: the pipeline reads every page in
`Category:Hot Wheels by Series` (about 2,240 pages — Car Culture, Boulevard, Team Transport,
Pop Culture, RLC, Forza, Fast & Furious, Formula One and the rest). Pages with a year in the
title are parsed for their own rows; pages without one are treated as index pages and only
their links are followed, so undated rows do not flood the dataset.
`data-pipeline/extra-pages.json` is now only a safety net for anything that category misses.

Worth checking after a run: the category also holds non-car product lines (1:18 scale,
"100% Hot Wheels"), which cost requests and add rows that may not belong in a die-cast
collection. If they turn out to be noise, filter them by title.

## 4. Casting codes (the code stamped under the car)

Correction to an earlier note here: the code **is** on the wiki. `insource:` search is disabled on
this wiki, which made it look absent. A plain search for `GRX20` finds `'20 Toyota GR Supra`, where
it is the **Toy #** of the car's first release — the row the wiki marks "New Model". The base tooling
keeps that code for every later release, which is why one code can cover many cars.

The pipeline now reads it that way: for each casting page, the debut row's toy number is written to
the `base` field of every row of that casting. So typing the code off the base of a car should find
it in the catalogue, not only among hand-added cars.

Still worth checking after the next run: how often the "New Model" note is actually present, and
whether the fallback (earliest year in the versions table) picks the right row. The short codes the
wiki writes as "Base code(s): T01, T03" are the small date/production codes, not this one, and are
not stored.
