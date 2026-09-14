# Corpus data and permission policy

Date: 2026-09-13
Status: accepted

## Context

M0 turns a community-maintained spreadsheet of Portland contra programs
into committed, derived data the demo milestone (M9) reads to choose
dances and tunes. The spreadsheet is someone else's live document (hall
names, callers, personal notes), and a contra dance's figure sequence is
the choreographer's own written work — neither is this project's to
redistribute wholesale into a public repository, even though the aggregate
facts derived from them (which dance was programmed how often, by how
many callers) are exactly what the demo needs and are themselves not
particularly sensitive.

## Decision

- **The source spreadsheet never enters the repository.** `scripts/corpus/import-portland.mjs`
  reads it from a path given on the command line (`$HOME/Downloads/...` on
  this machine) and writes only the derived aggregate,
  `data/corpus/portland-programs.json`. `.gitignore` backstops this with
  `data/local/` and `data/**/*.csv`.
- **No dance's figure text is stored.** Only facts a public program
  listing would already state are committed: a dance's title, its
  choreographer, how many times it was programmed, the number of distinct
  callers who called it, and the caller's own one-line "Features"
  shorthand (a representative phrase, not the full A1/A2/B1/B2 sequence).
  Encoding a dance's actual figures is M9's job, done from Caller's Box or
  ContraDB directly, dance by dance, with the author's clearance — not
  derived from this spreadsheet's Features column.
- **The 12 demo dances carry a `permission` field, read, not assumed.**
  `data/corpus/demo-dances.json` records each dance's Caller's Box
  `Permission:` field verbatim (all 12 read "full" as of this run) and its
  stated formation, fetched from exactly the 12 dance pages the demo list
  needs — no bulk crawl, no sign-in. This is the evidence gate G2 question
  2 (are you comfortable with all of these dances and authors being
  public?) is decided from; a missing or unreadable field is recorded as
  `"unknown"` rather than guessed.
- **Encoding a demo dance still needs the author cleared before
  publication**, independent of what Caller's Box's `Permission` field
  says — that field is the dance's own metadata, not a substitute for the
  director/user checking gate G2 before the hall demo goes public with a
  named choreographer's work in it.

## Consequences

- `data/corpus/portland-programs.json` is regenerable by anyone with their
  own copy of the spreadsheet; it is not regenerable from the public repo
  alone, by design.
- M9 cannot lift a dance's figures from `data/`; it has to go get them
  itself, dance by dance, which is where the author-clearance question
  actually gets asked and answered.
- If a future milestone wants richer aggregate data (e.g. tune pairings,
  more of the Features column), it goes through the same filter: only
  facts, never the choreography, and the spreadsheet stays out of git.
