# data/

Derived, committable data for the contra simulator: `corpus/` is generated
from a community spreadsheet and a handful of public dance database pages,
and `dances/` holds the demo's own encoded dances. The source spreadsheet
itself is never committed. See
`docs/adr/2026-09-13-corpus-and-permission.md` for the corpus's reasoning
and `docs/adr/2026-09-14-dances-as-files.md` for the dances'.

## `corpus/portland-programs.json`

What it is: aggregate statistics over every dance programmed at Portland,
Oregon contra dances, derived from the community-maintained "Portland
Contra Programs" spreadsheet — one row per program (a dated evening or
festival session) and its dances, going back to 2022. For each distinct
dance title: how many times it was programmed, how many distinct callers
called it, its choreographer, its Caller's Box id (when a program row
linked one), and the single most-common "Features" shorthand a caller used
to describe it (or, when every caller described it differently, one
representative phrasing — see the code comment on `pickTopFeatures` in the
importer for why an all-distinct set of phrasings is capped to one instead
of stored whole).

How it was derived: `scripts/corpus/import-portland.mjs` reads the source
CSV (never committed — see below) and groups consecutive rows into
programs by date, following corpus-analysis.md's parsing heuristic (a
program is a run of consecutive rows whose parsed date is unchanged; a
blank or non-date-shaped Date cell, and a blank Caller cell, both inherit
from the most recent row that did carry a value). Dance titles are
normalised with `packages/contra/src/corpus/normaliseTitle.ts`: leading
program-order numbers stripped, whitespace collapsed, and grouped
case-insensitively — deliberately not merging near-duplicate spellings
(curly vs. straight apostrophes, a leading "The", "(var)" tags); see that
file's tests for the named examples from corpus-analysis.md. Rows whose
title is made up entirely of session-filler words (`waltz`, `break`,
`hambo`, in any combination) are excluded, or they would swamp the count
ranking. The output is deterministic: the same CSV run through the
importer twice on the same day produces byte-identical JSON — `generated`
is a UTC calendar date, not a timestamp, precisely so this holds.

To regenerate:

```bash
node scripts/corpus/import-portland.mjs "$HOME/Downloads/Portland Contra Programs - Portland.csv"
pnpm format
```

## `corpus/demo-dances.json`

What it is: the 12 dances recommended in `corpus-analysis.md` section 6 as
the hall demo's dance list (M9), carried over verbatim — not re-derived —
plus, for each, the `formation` and `permission` fields read from that
dance's Caller's Box page (`https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=<id>`),
per `m00-corpus.md`'s permission-and-formation check. All 12 pages carried
`Permission: full`; formation is the page's stated "Formation Base" text
verbatim (e.g. "Duple Minor - Becket"). This file, not the CSV, is what
gate G2 question 2 (is everyone comfortable with these dances and authors
being public) is decided from.

M9 appended **33 more entries**, each marked `"source": "portland-fallback"`.
The library the demo dances from covers only four of the original twelve, so
M9 followed the milestone's own fallback and worked down
`portland-programs.json` by count, fetching one Caller's Box page per dance
and recording what it said. These entries carry three extra fields:
`portlandCount` (how often the dance was programmed), `encoded` (whether the
demo dances it), and a `reason` saying what stopped it when it does not —
a figure the library defers, a `permission` of `search` (The Caller's Box
will not display that dance's figures at all), or an oracle it failed, with
the number. Nine dances across both groups are encoded; they are the list
gate G2 question 2 is decided from.

This file is hand-assembled, not script-generated: the importer only
produces the general aggregate above. Regenerating it means re-reading
corpus-analysis.md section 6 and re-fetching the Caller's Box pages by
hand, the same way both runs did.

## `dances/<slug>.json`, `dances/programme.json`

What it is: the ten demo dances' actual figures — the A1/A2/B1/B2 sequence
that teaches the dance — as data, one file per dance, loaded by
`packages/contra/src/dances/`. Each carries the same provenance a dance's
TypeScript module used to state in a comment before D1: the Caller's Box id
and page URL the sequence was quoted from, that page's own `permission`
field, and the quoted transcript itself. `programme.json` holds the demo's
own dance order. See `docs/adr/2026-09-14-dances-as-files.md`.

This is deliberately not under the same rule as `corpus/` below — these ten
dances' figures already went through gate G2 (the director/user checking
that the dance and its named choreographer being public was acceptable) as
TypeScript source before this milestone; moving the identical, already
public content from a `.ts` file to a `.json` file changes nothing about
its clearance. A dance's figures reach `data/dances/` only after that gate,
never before it — see "Permission note" below, which is about `corpus/`.

## `figures/<figure-id>.json`

What it is: the four texts every move is written in — a short and a long
walkthrough, a short and a long call — one file per figure in the contra
registry, loaded by `packages/contra/src/text/`. These are **the project's
own words**, written for this repository, so they carry no `source` block
and need none: nothing here is quoted from The Caller's Box or from any
other publication, and the permission note below is about `corpus/`, not
about these.

Each text is a template over that figure's own parameters — `{pairs}`,
`{hand}`, `{amount}` and a short list of others — because the words depend
on who is where: the same do-si-do is "your neighbor" in one dance and
"your partner" in the next. `{where}` is the one slot nobody writes; the
engine fills it from the figure's own end places. A `variants` block gives
one parameter value its own prose where a slot is not enough.

They are plain JSON on purpose: the user is a caller and will edit them,
and editing them must not need a build. `docs/move-texts.md` is the voice
they are written in and the whole slot vocabulary;
`packages/contra/src/text/figureText.test.ts` enforces as much of it as a
machine can.

## `local/corpus-raw/callers-box/` (never committed)

`scripts/corpus/crawl-callers-box.mjs` (see `docs/corpus-crawl.md`) walks
The Caller's Box's dance ids upward, one JSON export per id at one request
every two seconds (ibiblio's own robots `Crawl-delay`), and writes each
hit's raw JSON byte-for-byte plus a `manifest.jsonl` provenance line per id
attempted (hit, miss, or error) under `data/local/corpus-raw/callers-box/`
— gitignored, resumable, and idempotent. This is a research cache, not
corpus data: nothing here is transformed, normalised, or published: a
dance's figures still need the same author-clearance gate `corpus/` and
`dances/` above already require, and a dance marked non-`"full"` there
stays unpublished for now regardless of anything cached locally, per the
user's own ruling recorded in `docs/corpus-crawl.md`.

## Permission note

The source spreadsheet (`Portland Contra Programs - Portland.csv`) is
never committed to this repository — it's a live community document with
notes, hall names and other detail beyond what the demo needs, and it
isn't this project's to redistribute. Nor does `corpus/` hold any dance's
figure text (the A1/A2/B1/B2 sequence that teaches the dance): only the
facts a program listing itself would state publicly are committed there —
a dance's title, its choreographer, how many times it's been programmed,
the caller's own free-text "Features" shorthand (one representative
phrase, not the raw sequence), and the Caller's Box `formation` and
`permission` fields. `.gitignore` excludes `data/local/` (for any future
downloads) and any `*.csv` under `data/` as a backstop.

Encoding a demo dance's actual figures (M9, F2) is what clears a dance for
`dances/` above — the clearance happens before the figures are encoded at
all, never merely before this data is committed, and a dance's figures
never sat in `corpus/` at any point.
