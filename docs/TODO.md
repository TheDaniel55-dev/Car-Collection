# To do

## 1. Run the dataset once over every year (1968 → today)

**Why it is not done yet:** colours, wheels and country live only on each casting's own page
(the "Versions" table). The yearly "List of YYYY Hot Wheels" pages have no colour column at all,
which is why the first dataset had colours on roughly 6% of rows. Phase 2 of the pipeline reads
the casting pages, but at one request per second it costs real time:

| Range | Casting pages | Run time |
|---|---|---|
| 2010 → today (current setting) | ~1,500 | ~30 min |
| 1968 → today | ~5,000 | ~2 h |

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

Premium, Car Culture, Team Transport, RLC and the themed sets are missing from the yearly lists.
They are reached through index pages listed in `data-pipeline/extra-pages.json`, which currently
holds only the Formula One collections. `npm run data` prints the other list-like pages it finds
on the wiki — add the useful ones to that file.

## 4. Casting codes (the code stamped under the car)

The code on the base of a car, such as `GRX20`, does not exist anywhere on the wiki
(searched with `insource:`, zero hits). It can only be learned from what gets typed into the app,
so the app stores every code → car it is taught, and one code may belong to many cars.
Nothing to fix here; this is a limit of the source.
