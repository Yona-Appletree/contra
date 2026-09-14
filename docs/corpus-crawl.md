# Crawling The Caller's Box

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

- **ContraDB.** Not touched by this script or this document. The user has
  not ruled on it, its unauthenticated `POST /api/v1/dances` API leaks
  `publish: "sketchbook"` (draft) records by default, and its maintainers'
  own stance is an open six-year-old GitHub issue (`contradb/contra#297`).
  Held as E15.
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

**To ContraDB** (`ContraDB.admonsterator@gmail.com`, cc referencing issue
#297) — kept here for completeness even though ContraDB itself is out of
scope for this crawler:

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
