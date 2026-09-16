# Crawling The Caller's Box and ContraDB

Two crawlers, one set of manners. The Caller's Box crawler is described
first; the ContraDB crawler (added 2026-09-16) follows under
[ContraDB](#contradb-scriptscorpuscrawl-contradbmjs).

This document covers the **raw** cache only — what is fetched, and how.
What the `scripts/corpus/derive-*.mjs` scripts turn that cache into, and the
shape of every file under `derived/`, is
[docs/corpus-derived.md](./corpus-derived.md).

`scripts/corpus/crawl-callers-box.mjs` fetches every dance's JSON export
from [The Caller's Box](https://www.ibiblio.org/contradance/thecallersbox/)
(`dance.php?id=<id>&format=JSON`), ids ascending from 1, one request ever
per id. It writes each fetched dance's raw JSON, byte for byte, and a
provenance manifest, both under `data/local/` — **nothing this script
fetches or writes ever enters git.** Encoding, normalising, or publishing a
dance's figures is later work, gated on author clearance exactly as
`docs/adr/2026-09-13-corpus-and-permission.md` already requires; this
script does none of that. It only builds a local research cache.

## The rate, and why

**One request every two seconds — not faster.** The Caller's Box has no
robots.txt of its own; it inherits ibiblio.org's domain-level file
(`https://www.ibiblio.org/robots.txt`), whose `User-agent: *` block states:

```
User-agent: *
Crawl-delay: 2
```

Nothing under `/contradance/` is disallowed, but the `Crawl-delay: 2`
applies site-wide, and this crawler honors it as a floor, never a target.
This is a stricter rate than the user's own instinct ("1 per second") —
director ruling DD32 chose the site's stated crawl-delay over the user's
suggestion, because the site asked for something specific and there's no
reason to do less than it requested. See
`2026-09-14-2000-corpus-scrape-discovery.md` (in the project's private
planning notes) for the full research this ruling is based on: the site's
lack of a stated terms/licence page, its `Permission` field's meaning, and
the id-space probes that found ids dense from 1 to at least 15,000 and
absent by 25,000.

## Where the data lands, and that it never enters git

```
data/local/corpus-raw/callers-box/<id>.json        # raw JSON, byte for byte, hits only
data/local/corpus-raw/callers-box/manifest.jsonl   # one line per id attempted (hit, miss, or error)
```

`data/local/` is gitignored (see `.gitignore`, backstopping
`docs/adr/2026-09-13-corpus-and-permission.md`'s rule that source/raw
corpus data is never committed). The crawler script itself
(`scripts/corpus/crawl-callers-box.mjs`) is committed — it's tooling, not
data. Nothing under `data/local/` should ever be `git add`ed; if you find
yourself about to do that, stop.

Each manifest line is:

```json
{
  "id": 10320,
  "url": "https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10320&format=JSON",
  "fetchedAt": "2026-09-14T20:22:50.000Z",
  "status": "ok",
  "sha256": "…",
  "bytes": 15638,
  "permission": "full",
  "title": "Butter",
  "choreographer": "Gene Hubert"
}
```

`status` is `"ok"` (a real dance record, written to `<id>.json`),
`"missing"` (a 404, or a 200 body that isn't a parseable dance record —
Caller's Box returns a small "no such dance" body with HTTP 200 for gaps
in the id space), or `"error"` (a network/HTTP problem that survived three
retries). Only `"ok"` rows get a raw `<id>.json` file; there's nothing
worth preserving byte-for-byte for a miss or an error. `permission`,
`title`, and `choreographer` are read verbatim from the dance's own JSON
(`Permission`, `Name`, `Authors`) and are `null` for anything that isn't a
hit — never guessed.

## The publication rule (DD31)

The manifest and raw cache exist for the corpus's own use (statistics,
cross-referencing, building future clearance decisions) — fetching and
caching every dance is fine per the user's own ruling ("ask for
forgiveness over permission unless it's likely to cause them pain").
**Publishing figure text is a separate, stricter question:**

- A dance whose Caller's Box `Permission` field reads `"full"` is
  publishable **with the user's explicit per-dance clearance** — the
  `Permission` field is necessary, never sufficient, exactly as the corpus
  ADR already requires for the twelve demo dances.
- A dance whose `Permission` is anything other than `"full"` (the FAQ's
  "Full searchable" / "Not searchable" / "Omit" tiers, whatever their
  literal string turns out to be) is **held in `data/local/` only, and
  never published, for now** — the user's own ruling today: "we should not
  publish the text of a dance marked private on callers box for now just
  out of respect and caution," even though "many of those dances _are_ on
  contradb in a readable form." That cross-reference case is real but out
  of scope for this crawler (ContraDB is not touched here — see "Out of
  scope" below).

This rule binds the _use_ of the cache, not the crawl itself: the crawler
fetches and records every id's `permission` field verbatim, whatever it
says, because knowing the value is exactly what lets a later step apply
this gate correctly. Nothing about fetching a non-`"full"` dance's JSON is
withheld; only publishing its figures is.

## Running it

Requires `CONTRA_CRAWL_CONTACT` (an email or similar contact address,
named in the crawler's `User-Agent` so a maintainer can reach a human) —
the script refuses to run without it:

```bash
# Resume (or start) the full crawl, from wherever the manifest left off:
CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-callers-box.mjs

# Same thing, via the root package.json script entry:
CONTRA_CRAWL_CONTACT="you@example.com" pnpm corpus:crawl

# Fetch only N dances and stop (does not require an empty manifest — it
# just stops after N attempts from wherever it started):
CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-callers-box.mjs --dry-run 50

# Cap the id space explored:
CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-callers-box.mjs --max-id 20000

# Print counts by status and by permission from the manifest, no network:
node scripts/corpus/crawl-callers-box.mjs --report
```

## Resuming

The crawl is resumable and idempotent by design: it reads
`manifest.jsonl` on startup, resumes one id past the highest id already
recorded, and additionally never refetches an id already present in the
manifest even if something calls it with an earlier start id. Stopping the
process at any point (Ctrl-C, a killed terminal, a machine restart) is
always safe — each id's manifest line and raw file are written and synced
before the crawler moves to the next id, so a resumed run picks up exactly
where the last one left off, at most refetching the single id that may
have been in flight when the process died (harmless: it just overwrites
that one row).

To resume an interrupted or partial crawl, run the exact same command that
was running:

```bash
CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-callers-box.mjs
```

The crawler stops on its own after 300 consecutive non-hits (`"missing"`
or `"error"`) past the highest known id — evidence the assigned id range
has run out — or at `--max-id` if one was given.

## Out of scope (held, not forgotten)

- **ContraDB** was held here (E15) until 2026-09-16; it now has its own
  crawler and its own section below. Nothing about the Caller's Box
  crawler changed for it.
- **Normalisation, parsing, or import** of anything the crawl fetches into
  the dance format `packages/contra/src/dances/` reads. That's a later
  mission's job, same as the corpus ADR already says for the Portland
  spreadsheet.
- **The Portland spreadsheet.** Unrelated to this crawler; see
  `scripts/corpus/import-portland.mjs` and `data/README.md` instead.

## Draft emails (not sent — kept here for the user to send, or not)

These are the two draft emails from the discovery document behind this
crawl. Neither has been sent. Sending either is the user's call, not
something this script or milestone does automatically.

**To The Caller's Box** (`chriscpage+thecallersbox@gmail.com`,
`jmdyck@ibiblio.org`):

> Subject: Bulk-reading The Caller's Box for a research project
>
> Hi Chris and Michael,
>
> I'm building a small open-source contra dance simulator and would like
> to fetch each dance's JSON export (`?format=JSON`) once, id by id, to
> build a local research cache — respecting your site's 2-second
> crawl-delay throughout, so it'll take roughly half a day of
> low-intensity traffic. I won't republish anything beyond what a dance's
> own `Permission` field allows, and figures from non-`full` dances stay
> out of anything public. If this is unwelcome, or you'd rather point me
> at a bulk dump instead of ~18,000 individual requests, just say so and
> I'll hold off entirely — no hard feelings either way.
>
> Thanks for maintaining such a useful resource.

**To ContraDB** (`ContraDB.admonsterator@gmail.com`) — **sent by the user
on 2026-06-01; no reply as of 2026-09-16.** That silence, after three and
a half months, is the footing the ContraDB crawler below proceeds on. The
text as drafted:

> Subject: Reading ContraDB's public API for a research project
>
> Hi — I'm building an open-source contra dance simulator and noticed
> `POST /api/v1/dances` is open and unauthenticated. I'd like to page
> through it once to index dances marked `publish: "all"`, then fetch each
> of those dance pages once for figure text — at a self-imposed
> 2-second-per-request pace, filtering out `sketchbook` and private dances
> before ever touching their pages. Nothing gets republished without
> per-dance clearance from me first. I saw issue #297 is still open on
> exactly this question — happy to weigh in there, or to hold off entirely
> if this isn't wanted. Let me know either way.

## Lint and dependency-check coverage

`scripts/corpus/` sits outside every workspace package
(`pnpm-workspace.yaml` lists only `packages/*` and `apps/*`), which is
also true of the existing `scripts/corpus/import-portland.mjs`. Two
consequences, both pre-existing and not introduced by this script:

- `pnpm check:deps` (`scripts/check-deps.mjs`) only walks the package
  directories in its own table; it never scans `scripts/`, so it neither
  covers nor needs to cover this file (it has no `@caller/*` imports to
  check in the first place).
- `pnpm exec turbo run lint` runs each workspace package's own `eslint .`
  scoped to that package's directory; nothing at the repo root outside a
  package (`scripts/`, `data/`, this file) is in that graph, since
  `turbo.json` only gives `format:check` and `check:deps` an explicit
  root-level (`//#…`) task. `scripts/corpus/crawl-callers-box.mjs` was
  linted manually instead — `pnpm exec eslint scripts/corpus/` — and is
  clean; `pnpm exec prettier --check .` (part of `format:check`, which
  _does_ run repo-wide) does cover it.
- Similarly, its test (`crawl-callers-box.test.mjs`) is not picked up by
  `pnpm exec turbo run test` for the same reason — no workspace package
  owns `scripts/`. Run it directly: `pnpm exec vitest run
scripts/corpus/crawl-callers-box.test.mjs`.

## ContraDB (`scripts/corpus/crawl-contradb.mjs`)

Added 2026-09-16. The user's ruling, verbatim: "proceed with a gentle
scrape, same rules as caller's box: 2s per call, keep the data next to
that data but separate, build a tool to do it and update it later."

ContraDB (https://contradb.com, Dave Morse's AGPL Rails app, source at
`github.com/contradb/contra`) is here for one thing The Caller's Box does
not carry: **a per-figure progression mark.** ContraDB's own curation
guide asks transcribers to "use the '⁋rogress' menu option at least once
per dance", and defines it as "the progression happens after the figure".
On a dance page it is rendered as a pilcrow at the end of the figure's
text — `<div class="show-figure">slide left along set ⁋</div>`. It is a
human-entered flag, so older or hastier transcriptions may lack it;
`--report` counts how many cached dances carry one.

### What ContraDB exposes, and what the crawler reads

- **`robots.txt`** allows everything and states no crawl-delay. The source
  has no rate limiter. The two-second floor is carried over from the
  Caller's Box crawler by the ruling above, not asked for by the site.
- **`POST /api/v1/dances`** — an unauthenticated JSON search endpoint (the
  same one the site's own search page uses). For each dance visible to an
  anonymous visitor it returns id, title, choreographer (name and id),
  formation, hook, transcriber, `publish` tier, and created/updated
  timestamps. **Figures are not in it.** Default order is `created_at`
  descending, which is stable across pages. Found on 2026-09-16: a page
  of 500 answers HTTP 500 while 200 is fine, and one run of four
  consecutive dances (created 2025-04-17 to 2025-04-23, somewhere in ids
  2702–2832) crashes any page that includes them. The crawler halves a
  page that answers 5xx down to a single dance and steps over one that
  still fails, logging the offset. **Those four dances are absent from the
  cache — a known gap**, four of 2,370.
- **`GET /dances/<id>`** — the dance page, ~7 KB of server-rendered HTML,
  figures and pilcrows included, in ContraDB's default dialect
  (gentlespoons/ladles). This is the only place the figures are readable
  without an account, so this is what gets cached, byte for byte.
- **`GET /choreographers`** — the public consent table, one page: each
  choreographer's `publish` consent (never / sometimes / always /
  deceased-and-unknown, or blank). Cached once per run.

### Visibility rules the crawler applies

ContraDB has three publish tiers: `off` (private), `sketchbook` (draft),
and `all` (shown as "everywhere"). Private dances never appear in the
listing and their pages 404 anonymously. Sketchbook dances **do** appear in
the listing (the API queries with `sketchbook: true` regardless of who is
asking) and their pages are readable by URL — but the server stamps them
`X-Robots-Tag: noindex`, which is as explicit a "do not index" as a site
can give. So:

- Only `publish: "everywhere"` dances have their page fetched.
- Sketchbook dances are recorded in the manifest as `status: "skipped"`
  (title and choreographer copied from the listing, so the count is
  known), and never fetched.
- Any page that nevertheless arrives with `X-Robots-Tag: noindex` is
  discarded unread (`status: "noindex"`). Belt and braces; it should
  never trigger.

### Rate and identification

One request every two seconds, every request — listing pages, the
choreographers page, dance pages, and retries alike. A network error backs
off (doubling from 4 s, capped at 60 s, three retries) and is then recorded
as `status: "error"` and retried on the next run. The User-Agent is the
same shape as the Caller's Box crawler's and requires `CONTRA_CRAWL_CONTACT`.

The first run, 2026-09-16 (log in `data/local/crawl-contradb.log`): one
listing pass of 31 requests (15 pages plus the bisect around the four
unlistable dances), the choreographers page, and 2,178 dance pages, all
`ok`, none missing or erroring, median gap 2.1 s, 76 minutes end to end,
21 MB on disk. `--report` afterwards: 1,862 of the 2,178 cached dances
carry at least one ⁋ (1,768 exactly one; 94 two or more), 316 carry none;
18,046 figures in all, 1,972 of them marked.

### Where the data lands, and that it never enters git

```
data/local/corpus-raw/contradb/index-page-<n>.json   # each listing page's raw JSON, overwritten per run
data/local/corpus-raw/contradb/choreographers.html    # the consent table, raw, overwritten per run
data/local/corpus-raw/contradb/<id>.html              # one dance page, raw, "everywhere" dances only
data/local/corpus-raw/contradb/manifest.jsonl         # one line per dance per attempt; last line per id wins
```

`data/local/` is gitignored, same as for the Caller's Box — and since
2026-09-16 it is a symlink to the private `contra-data` checkout (see
`data/README.md`; `CONTRA_DATA_DIR` overrides the location for both
crawlers). Each manifest line copies its descriptive fields verbatim from
the listing — nothing is parsed out of the page:

```json
{
  "id": 1,
  "url": "https://contradb.com/dances/1",
  "fetchedAt": "2026-09-16T15:30:00.000Z",
  "status": "ok",
  "sha256": "…",
  "bytes": 7310,
  "publish": "everywhere",
  "title": "The Rendezvous",
  "choreographer": "Dan Pearl",
  "choreographerId": 12,
  "formation": "improper",
  "transcriber": "Dave Morse",
  "createdAt": "2015-06-27T02:14:07.000Z",
  "updatedAt": "2019-01-05T18:12:44.000Z"
}
```

`status` is `"ok"`, `"missing"` (404 — made private or deleted between the
listing and the fetch), `"noindex"`, `"error"`, or `"skipped"`
(sketchbook). Only `"ok"` lines have a cached page.

### Updating later

Re-running is the update mechanism, and it is cheap: the listing is
re-read (one pass), and a dance's page is fetched only if it is new, its
`updated_at` differs from the manifest's, its last attempt errored, or it
has moved out of the sketchbook. Unchanged dances cost nothing. Dances the
manifest knows that the listing no longer lists (unpublished, made
private, or deleted since) are logged as "gone" and left alone — their
cached page stays, and the report shows their last status.

```bash
# Full run, or an update — the same command either way:
CONTRA_CRAWL_CONTACT="you@example.com" pnpm corpus:crawl:contradb

# See what a run would fetch (one listing pass, no pages):
CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-contradb.mjs --plan

# Fetch at most N pages and stop:
CONTRA_CRAWL_CONTACT="you@example.com" node scripts/corpus/crawl-contradb.mjs --dry-run 5

# Counts by status and tier, plus how many cached dances carry a ⁋ (no network):
node scripts/corpus/crawl-contradb.mjs --report
```

The crawl is safe to interrupt: each dance's manifest line and page are
written before the next request, and the next run simply skips what is
already cached at the current `updated_at`.

### The ethics footing, and the publication rule

- The user emailed the site's live contact address on 2026-06-01 stating
  the intent, the rate and the publication limits (the draft above), and
  had no reply by 2026-09-16. The user's standing rule — "ask for
  forgiveness over permission unless it's likely to cause them pain" —
  covers a 75-minute crawl at this rate.
- The maintainers' ethics discussion (`contradb/contra#297`, opened 2018,
  still open) was read but deliberately **not** commented on — the user's
  call: "no one has commented on that post in 8 years, I don't really
  want to unearth it."
- Fetching and caching is all this crawler does. **Publishing anything
  from the cache is governed by the ADR amendment of 2026-09-16** in
  `docs/adr/2026-09-13-corpus-and-permission.md`: same shape as the
  Caller's Box rule, with ContraDB's own signals (`publish: "everywhere"`,
  the choreographer's consent tier) standing in for the Caller's Box
  `Permission` field.
- Contact addresses, for the record: `ContraDB.admonsterator@gmail.com`
  is the one the live site shows today (every dance page, the help
  page); `adminisaur@contradb.com` appears only in the years-old wiki and
  issue thread.

### Lint and test coverage

Same situation as the Caller's Box crawler (see above): `scripts/` is
outside every workspace package, so run `pnpm exec eslint scripts/corpus/`
and `pnpm exec vitest run scripts/corpus/crawl-contradb.test.mjs` directly.
`pnpm exec prettier --check .` does cover both files.
