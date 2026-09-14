# data/

Derived, committable corpus data for the contra simulator. Everything here
is generated from a community spreadsheet and a handful of public dance
database pages; the source spreadsheet itself, and any dance's figure text,
are never committed. See `docs/adr/2026-09-13-corpus-and-permission.md` for
the reasoning.

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

This file is hand-assembled, not script-generated: the importer only
produces the general aggregate above. Regenerating it means re-reading
corpus-analysis.md section 6 and re-fetching the 12 Caller's Box pages by
hand, the same way this run did.

## Permission note

The source spreadsheet (`Portland Contra Programs - Portland.csv`) is
never committed to this repository — it's a live community document with
notes, hall names and other detail beyond what the demo needs, and it
isn't this project's to redistribute. Nor is any dance's figure text
(the A1/A2/B1/B2 sequence that teaches the dance): only the facts a
program listing itself would state publicly are committed here — a
dance's title, its choreographer, how many times it's been programmed,
the caller's own free-text "Features" shorthand (one representative
phrase, not the raw sequence), and the Caller's Box `formation` and
`permission` fields. `.gitignore` excludes `data/local/` (for any future
downloads) and any `*.csv` under `data/` as a backstop.

Encoding a demo dance's actual figures (M9) is out of scope here, and per
the ADR, needs the dance's author's clearance before the demo publishes it
— not before this data is committed, since none of the figures live here.
