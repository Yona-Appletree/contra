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

## Amendment, 2026-09-14 (DD31): publication policy for a bulk-crawled corpus

C1 added a resumable crawler (`scripts/corpus/crawl-callers-box.mjs`,
`docs/corpus-crawl.md`) that walks The Caller's Box id space and caches every
dance's raw JSON, whatever its `Permission` field says, under `data/local/`
(gitignored, per this ADR's own rule that source/raw corpus data never enters
git). That cache is wider than the 12-then-10 demo dances this ADR was written
about, so the publication question needed a ruling of its own. The user, asked
directly:

> "as a general rule, in the contra community, dances are public. even the
> ones marked 'private' on callers box are shared freely among callers, and
> since there are youtube videos of them, they aren't actually private in any
> meaningful way. that being said, I think we should not publish the text of
> a dance marked private on callers box for now just out of respect and
> caution. its notable that many of those dances _are_ on contradb in a
> readable form."

**Decision:** a dance whose Caller's Box `Permission` field reads `"full"` is
publishable **with the user's explicit per-dance clearance** — the field is
necessary, never sufficient, exactly as this ADR already required for the
demo dances. A dance whose `Permission` is anything else (a "private" tier, or
any non-`"full"` value) is **held in `data/local/` only, and not published,
for now** — not because the community treats it as truly confidential (it
does not, per the user's own framing above), but out of the project's own
respect and caution, independent of whatever ContraDB or a YouTube video
already shows of the same dance. This binds _publication_, not the crawl
itself: fetching and caching a non-`"full"` dance's JSON is unaffected, and its
`permission` field is recorded verbatim in the manifest precisely so this rule
can be applied correctly later.

This is consistent with, and extends rather than revises, this ADR's existing
rule that a dance's figures reach `data/dances/` only after author clearance:
`Permission: full` plus clearance is now the concrete two-part gate for
anything drawn from the wider crawled cache, where the original text only had
the ten-then-twelve dances' own page-by-page check to describe.

`docs/corpus-crawl.md` states the same rule (its own "publication rule
(DD31)" section) and the crawl rate ruling this ADR does not cover (DD32: the
crawler honors ibiblio's `robots.txt` `Crawl-delay: 2` as a floor) — the two
documents agree as of this amendment.

## Amendment, 2026-09-16: ContraDB

A second crawler (`scripts/corpus/crawl-contradb.mjs`, described in
`docs/corpus-crawl.md` under "ContraDB") now caches ContraDB's public
dances under `data/local/`, for the per-figure progression mark The
Caller's Box lacks. The user's ruling: "proceed with a gentle scrape, same
rules as caller's box." The footing: an email to the site's live contact
address on 2026-06-01, unanswered by 2026-09-16, and the user's standing
"forgiveness over permission unless it's likely to cause them pain" rule.

**What is fetched** is decided by ContraDB's own signals, not ours: only
dances in its "everywhere" publish tier. Sketchbook (draft) dances, which
the site marks `noindex`, are listed in the manifest but never fetched;
private dances are never seen.

**What may be published** keeps the shape of the DD31 rule, with
ContraDB's signals standing in for the Caller's Box `Permission` field:

- A dance's figure text from a ContraDB page is publishable only if it is
  in the "everywhere" tier, **and** its choreographer's consent on
  ContraDB's `/choreographers` table is not "never", **and** the user
  clears it per dance. Necessary, never sufficient, exactly as before.
- A dance that is in the Caller's Box cache as non-`"full"` stays
  unpublished under DD31 even if ContraDB shows it readable — that ruling
  already anticipated this exact overlap ("many of those dances _are_ on
  contradb in a readable form") and chose caution.
- **Open, not yet ruled:** whether the _derived_ progression fact (which
  figure, and at which beat, a dance progresses after, together with its
  formation) may be published as a fact about a dance, the way the
  Portland features column is — without the figure text. The user has
  seen this proposed and not decided it. Until ruled, nothing derived from
  the ContraDB cache is published either.

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
