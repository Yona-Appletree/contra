# The derived corpus

What the scripts under `scripts/corpus/derive-*.mjs` write into the private
`contra-data` repository's `derived/` tree, what each file means, and the rules
that apply to it. This is the contract every derive script and every consumer
builds against. `docs/corpus-crawl.md` covers the raw cache these scripts read;
`docs/adr/2026-09-13-corpus-and-permission.md` is the ruling on what may be
published. Written 2026-09-16, when the data moved to `../contra-data`.

## Why it exists

The raw cache is 16,874 Caller's Box JSON files whose figures are opaque
strings, and 2,195 ContraDB HTML pages. Neither is something an agent can
query. The derived tree turns them into one normalised record per dance, a
cluster table that joins the same dance across sources, a tagged index, and
two named sets of dances to test the engine against. Every file is generated;
the only hand-edited file is `derived/sets/pins.json`.

## Where things live, and the three tiers

```
contra-data/corpus-raw/            raw, crawler-only, private            (tier: raw)
contra-data/derived/dances/        normalised Caller's Box records        (tier: derived, private)
contra-data/derived/contradb/      parsed ContraDB records                (tier: derived, private)
contra-data/derived/clusters.json  one dance under several ids            (tier: derived, private)
contra-data/derived/index.jsonl    one line per record: tier, tags, status
contra-data/derived/sets/          hand.json, suite.json, pins.json
contra/data/corpus/index.jsonl     a copy of the index: facts only, public
contra/data/corpus/sets/           copies of hand.json and suite.json: ids and reasons, public
contra/data/corpus/fixtures/       normalised records for the hand set only (tier: fixture, public)
contra/data/dances/                encoded dances the app renders          (tier: shipped, public)
```

The permission ADR defines the tiers. In one line each: **raw** never leaves
the private repository; **derived** is private too, but CI may read it through
a read-only token so the suite runs on every push; **fixture** is a small
public set, `Permission: full` only, attributed on every record, never
rendered or indexed by the site, pruned whenever a dance leaves `full`;
**shipped** is what the app dances, and keeps per-dance clearance.

## Running

From a checkout of `contra` with `contra-data` beside it (or `CONTRA_DATA`
pointing at it):

```bash
node scripts/corpus/derive-dances.mjs      # corpus-raw/callers-box → derived/dances
node scripts/corpus/derive-contradb.mjs    # corpus-raw/contradb   → derived/contradb
node scripts/corpus/derive-clusters.mjs    # both + data/corpus/portland-programs.json → derived/clusters.json
node scripts/corpus/derive-index.mjs       # dances + clusters + data/dances → derived/index.jsonl
node scripts/corpus/derive-sets.mjs        # index + sets/pins.json → sets/hand.json, sets/suite.json
node scripts/corpus/derive-fixtures.mjs    # sets/hand.json → contra/data/corpus/fixtures, index and set copies
```

Every script is deterministic: the same inputs produce identical bytes, and
each formats its output through prettier with this repository's config
(print width 100), so a copy into `data/corpus/fixtures/` passes
`format:check` unchanged. Running `prettier --check` from inside `contra-data`
will flag them, because that repository has no config; that is expected. Every script
accepts `--data <path>` to override the data root (else `$CONTRA_DATA`, else
`$CONTRA_DATA_DIR`, which the crawlers and `update.sh` export, else
`../contra-data`), `--only <id>[,<id>]` to process a few records (not
`derive-clusters`, whose output is global and would be wrong for a subset),
and `--report` to print counts without writing. Tests
live beside each script as `derive-<name>.test.mjs` and run with
`pnpm exec vitest run scripts/corpus`; they use hand-written inputs, never the
cache. `contra-data/update.sh` runs the whole chain after each crawl.

## `derived/dances/<id>.json`: a normalised Caller's Box record

One file per raw record whose `phrases` is non-empty. Records with
`Permission: "search"` (4,871) or `"no_figures"` (2) have no figures and get
no derived file; `--report` counts each on its own line.

```jsonc
{
  "source": "callers-box",
  "id": "10320",
  "url": "https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10320",
  "fetchedAt": "2026-09-14T20:22:50+00:00", // the raw record's download_date
  "permission": "full", // verbatim
  "status": "", // "" | "deprecated" | "broken", lower-cased
  "title": "Butter",
  "authors": ["Gene Hubert"],
  "otherNames": [],
  "formation": {
    "base": "Duple Minor - Becket", // verbatim FormationBase
    "detail": "", // verbatim FormationDetail
    "id": "becket", // our formation id, or null; see the mapping below
  },
  "progression": "Single", // verbatim
  "direction": "CW", // verbatim, "" when absent
  "mixer": false, // Mixer? non-empty
  "phraseStructure": "4*8*2", // verbatim, or "4*8*2" when the raw field is ""
  "videos": 280, // Videos.length; the popularity proxy
  "appearances": 8, // Appearances.length
  "callingNotes": [], // verbatim
  "phrases": [
    {
      "name": "A1", // verbatim
      "beats": 16, // sum of the top-level lines' beats; null if any is null
      "lines": [
        {
          "raw": "(2) Shift left", // the string exactly as the site sent it
          "beats": 2, // the leading (N), or null when there is none or it is a range: "(1-8)" stays in text (785 lines)
          "text": "Shift left", // raw with the count and surrounding space removed
          "head": "shift left", // provisional: first two words after the actor is stripped
          "relations": [], // the Caller's Box relation words found: "N2", "S", "C1", …
          "fractions": [], // "3/4", "1 & 1/2", … as written
        },
        {
          "raw": "(16) Hey (WR;NL;MR;PL;WR;NL;MR)",
          "beats": 16,
          "text": "Hey (WR;NL;MR;PL;WR;NL;MR)",
          "head": "hey",
          "relations": ["N", "P"], // relation shorthand includes the stems of pass tokens (WR→W is a role and drops; NL→N)
          "fractions": [],
          "passes": ["WR", "NL", "MR", "PL", "WR", "NL", "MR"], // a parenthesised list of 2+ ";"-separated tokens matching [A-Z0-9-]*[RL]~? — bare "R"/"L" tokens count
        },
      ],
    },
  ],
  "flags": {
    // counts over all lines; the index turns non-zero ones into tags
    "uncounted": 0, // lines with no (N)
    "zeroBeat": 0, // lines with (0)
    "concurrent": 0, // lines split into branches
    "composite": 0, // lines with children
    "oddCounts": 0, // beats not divisible by 2
    "either": 0, // lines containing "//"
    "undefined": 0, // lines containing "?"
  },
}
```

Two line shapes beyond the plain one:

- **Concurrent.** A line containing `||`, or `while` case-insensitively,
  keeps its `text` whole and adds `"branches": [Line, …]` (two or more; 13
  lines split into three), each branch a plain line without `raw` and without
  `beats` (a branch takes the parent's). When both markers appear, `||` wins.
  The Caller's Box also writes `,` for "while"; a comma is **not** split,
  because it is also ordinary punctuation. The index tags on `branches`.
- **Composite.** Indentation, not the trailing `:`, marks a child: a raw line
  beginning with five spaces belongs to the nearest preceding line with less
  indentation, recursively (ten spaces is a grandchild; three dances do it).
  Most parents end in `:`, but 61 lines in 22 dances are indented under a
  parent without one, and only the indentation rule gives those phrases the
  right beat sum. Children are full lines with their own `raw`, `beats` and
  `text` (leading spaces trimmed from `text`, kept in `raw`). Every parent
  carries `childrenBeatsMismatch`, `true` when the children's beats do not sum
  to its own `(N)`; nothing is corrected.

`head` is a heuristic and is marked as such everywhere it is used: lower-case,
parenthesised and bracketed spans removed (3,905 lines lead with `[Ends]`,
`[Groups of four]` and the like), a leading relation shorthand that introduces
an actor stripped (`N3 men allemande left` → `allemande left`, but never a
bare `ON`, which is also English), a leading actor phrase stripped (`neighbor`, `partner`,
`ladies`, `men`, `women`, `larks`, `robins`, `ones`, `twos`, `all`, `N2
neighbor`, `same-role neighbor`, `in long lines,` and the like), then the first
two words. It exists so the index can tag figure families before a dance is
encoded, and it is replaced by the encoded record's figure ids the moment one
exists.

Formation id mapping (`FormationBase` → our id; anything else → `null`):

| FormationBase            | id               |
| ------------------------ | ---------------- |
| `Duple Minor - Improper` | `duple-improper` |
| `Duple Minor - Becket`   | `becket`         |
| `Duple Minor - Proper`   | `proper`         |

## `derived/contradb/<id>.json`: a parsed ContraDB record

One file per cached page. ContraDB serves figures only as rendered HTML, in
the table with class `contra-table-nonfluid`, one `<tr>` per figure with a
phrase label cell (blank when the figure continues the phrase), a
`dance-show-beats` cell, and a `show-figure` cell whose text is the figure in
ContraDB's default dialect (gentlespoons and ladles), with `<u>` and `<s>`
lingo marks and a trailing `⁋` on the progression figure.

```jsonc
{
  "source": "contradb",
  "id": "1",
  "url": "https://contradb.com/dances/1",
  "fetchedAt": "…", // from the manifest line for this id
  "publish": "everywhere",
  "title": "The Rendezvous",
  "choreographer": "Dan Pearl",
  "formation": "improper", // the free-text start_type as shown
  "hook": "", // text, lingo marks removed
  "preamble": "",
  "notes": "",
  "figures": [
    {
      "index": 0,
      "phrase": "A1", // the label cell, or the label carried from the last non-blank one
      "startsPhrase": true,
      "beats": 16,
      "text": "neighbors balance & swing", // entities decoded, <u>/<s> tags removed, ⁋ removed, whitespace collapsed
      "progression": false,
      "lingo": { "underlined": [], "struck": [] }, // the marked words, for the record
    },
  ],
  "beats": 64, // sum
  "warnings": [], // always present; what the parser could not find, never a crash
}
```

Quirks of the pages the parser allows for: the hook paragraph closes with a
stray `</h2>` on every hooked page; every `<tr>` is followed by an orphan
`</tr>`; `formation` is free text with over a hundred spellings and is kept
verbatim; `preamble` and `notes` are rendered markdown, flattened to one line.
`lingo.underlined` and `lingo.struck` hold each mark's whole text (a mark is
often a phrase), not single words.

## `derived/clusters.json`: one dance under several ids

The Caller's Box holds variants of one dance under several ids (Heartbeat
Contra is 155 videos under one id and 69 under another), ContraDB holds its own
copy, and the Portland programme sheet names dances by title. A cluster joins
them so popularity can be summed and a dance found from any source.

```jsonc
[
  {
    "cluster": "butter--gene-hubert", // titleKey + "--" + authorKey
    "titleKey": "butter", // normaliseTitle's titleKey (packages/contra/src/corpus/normaliseTitle.ts), then braces "{…}" and a trailing "(var)" removed
    "authorKey": "gene-hubert", // first author, lower-case, kebab
    "callersBox": ["10320"], // ids, most videos first
    "contradb": ["…"],
    "portland": {
      // or null; several Portland rows may land on one cluster (115 do), so they are summed and kept
      "count": 17, // sum of the rows' counts
      "callers": 12, // max over the rows
      "rows": [{ "title": "Butter", "count": 17, "callers": 12, "callersBoxId": "10320" }], // every row verbatim, highest count first
    },
    "videos": 280, // sum over callersBox members
    "canonical": "10320", // the Caller's Box id with the most videos, or the first; a cluster with no Caller's Box member falls back to its first ContraDB id, then null
    "note": "", // set when the join was by title alone (no author match): "title-only"
  },
]
```

Joining rules, in order: a Portland row's `callersBoxId` joins it to that
record's cluster outright; otherwise `titleKey` and `authorKey` both match;
otherwise `titleKey` matches and one side has no author (`Traditional`,
`Unknown person`, `unknown`, `anon`, blank, on either source), recorded as
`title-only`. `authorKey` is the first author after every author string is
split on " and ", " & ", "," and ";", so a co-authored dance keys the same
whether a source stores one string or a list. An authorless cluster id ends
in a bare `--`. A title match with two
different named authors does **not** join (there are several dances called
"Butter"). Every record is in exactly one cluster, alone if nothing joins it.

Two known artefacts, accepted for now: `circassian circle--` is the largest
cluster by videos (426) and rests on the weakest rule, three authorless
records joined by title; and the Portland sheet's own `callersBoxId` for
"Cows Are Watching" points at Cary Ravitz's "Cows are Watching Variation"
(id 9686), so rule one faithfully puts the Portland row there while the Bill
Pope original (7173, 60 videos) has none. A correction belongs in the sheet,
or in a future override list, not in the joining rules.

## `derived/index.jsonl`: one line per Caller's Box record

Plain JSON per line, keyed by the record id. ContraDB records appear only
through their cluster.

```jsonc
{
  "id": "10320",
  "cluster": "butter--gene-hubert",
  "title": "Butter",
  "authors": ["Gene Hubert"],
  "permission": "full",
  "formation": "becket", // our id or null
  "videos": 280,
  "clusterVideos": 280,
  "portlandCount": 17,
  "tier": 1,
  "tags": [
    "formation:becket",
    "progression:single",
    "relation:neighbor",
    "relation:partner",
    "figure:hey",
    "figure:chain",
    "figure:circle",
    "figure:swing",
    "figure:slide",
  ],
  "tagsProvisional": true, // false once tags come from an encoded record
  "status": "shipped", // not-started | custom-only | lab | shipped
  "slug": "butter", // data/dances slug when encoded, else null
  "publishable": "shipped", // gated | fixture | cleared | shipped
}
```

**Tier** is from cluster popularity: 1 when `clusterVideos ≥ 50` or
`portlandCount ≥ 8`; 2 when `≥ 10` or `≥ 3`; 3 when the cluster is in the top
500 by `clusterVideos` or `portlandCount ≥ 1`; 4 otherwise.

**Status**: `shipped` when a `data/dances/<slug>.json` names this id in
`source.callersBoxId` and carries no `status` field; `lab` when it carries
`"status": "lab"`; `custom-only` when it exists but every call is the `custom`
figure; `not-started` otherwise.

**Publishable**: `shipped` when status is shipped or lab (the record is already
public); `fixture` when the record is in `sets/hand.json` and `permission` is
`full`; `cleared` is set only by hand through `pins.json` for a dance the
author has cleared; `gated` otherwise. A record whose permission is not `full`
is `gated` whatever set it is in. Because the sets are computed from the
index, `derive-index` writes every non-shipped record as `gated` and
`derive-sets`, after writing the sets, rewrites the `publishable` field of the
lines it selected; the chain is index → sets, never index → sets → index.

### The tag vocabulary

Tags are `axis:value`. A record carries every value that applies. Until a
dance is encoded, values on the relation, concurrency, timing and figure axes
come from the derived record's `text`, `relations`, `flags` and `head` fields
by the rules stated here, and `tagsProvisional` is true.

| Axis          | Values                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Provisional rule                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formation`   | `improper` `becket` `proper` `triple-minor` `circle-mixer` `facing-lines` (four facing four, three facing three, Sicilian circle) `other`                                                                                                                                                                                                                                                                                                                         | from `FormationBase`                                                                                                                                 |
| `progression` | `single` `double` `none` `other`                                                                                                                                                                                                                                                                                                                                                                                                                                  | from `Progression`                                                                                                                                   |
| `phrase`      | `standard` `nonstandard`                                                                                                                                                                                                                                                                                                                                                                                                                                          | `phraseStructure` is `4*8*2` and four phrases named A1 A2 B1 B2, or eight named with a `2` prefix                                                    |
| `relation`    | `neighbor` `partner` `next-neighbor` (N2, N3) `prev-neighbor` (N0, N-1) `shadow` `same-role` `diagonal` `corner` `opposite` `trail-buddy` `ones-twos` `six` (groups of six, hey for six, contra corners)                                                                                                                                                                                                                                                          | from `relations` and text                                                                                                                            |
| `concurrency` | `none` `split`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `flags.concurrent > 0`                                                                                                                               |
| `timing`      | `composite` `odd-counts` `zero-beat` `uncounted` `either` `swing-off-grid` (a swing whose beats is not 8, 10, 12 or 16)                                                                                                                                                                                                                                                                                                                                           | from `flags` and lines                                                                                                                               |
| `figure`      | `swing` `balance` `circle` `star` `allemande` `do-si-do` `chain` `right-left-through` `hey` `hey-partial` (ricochet, broken, 1/4, 3/4, `~`) `wave` `long-lines` `down-the-hall` `petronella` `pass-through` `square-through` `pull-by` `roll-away` `twirl` (California twirl, box the gnat, swat the flea) `mad-robin` `shoulder-round` `promenade` `slide` `slice` `poussette` `give-and-take` `circulate` `orbit` `contra-corners` `cast` `figure-eight` `arch` | from `head` and text; each value's word list lives in `derive-index.mjs` with the value, and a test pins every list to at least one real-shaped line |

Adding a value is a change to this table and to the script's list together.
Readings the scripts take where the table leaves room: `hey-partial` is
literal (ricochet, broken, quarter, three-quarter, `~`), so a plain `Hey 1/2`
is only `figure:hey`; `formation` maps only the spellings named above and puts
Indecent, Progressed improper and Reverse progression improper in `other`;
`progression` reads the sentence before the first full stop, so `Single. Swap
sides` is `single`, and a blank field is `other`; `relation:corner` excludes
contra corners, which is `six`; `swing-off-grid` needs a counted swing; a
`cleared` pin beats `fixture` whatever the permission, and shipped beats both.
`figure:actives` was in the first draft of this table and fired on two records
in twelve thousand (the corpus writes "ones" and "twos"); it was removed.

## `derived/sets/`

`pins.json` is hand-edited and is the only file in `derived/` that is:

```jsonc
{
  "include": [{ "id": "10320", "reason": "shipped demo dance" }],
  "exclude": [{ "id": "…", "reason": "duplicate of 10320" }],
  "cleared": [{ "id": "…", "reason": "author clearance, email of 2026-…" }],
}
```

`hand.json` and `suite.json` share one shape:

```jsonc
{
  "generatedAt": "2026-09-16", // a date, so the file is stable within a day
  "rule": "3 per tag value by clusterVideos, permission full, plus pins",
  "dances": [
    {
      "id": "10320",
      "cluster": "butter--gene-hubert",
      "title": "Butter",
      "tier": 1,
      "reasons": ["pin:shipped demo dance", "tag:figure:hey", "tag:formation:becket"],
    },
  ],
}
```

**hand** is built greedily so it stays small: start with the `include` pins;
then, among `permission: full` records not yet chosen (one record stands for a
cluster, globally), repeatedly pick the one covering the most tag values still
below a quota of **two**, ties broken by `clusterVideos` descending then id,
until every value has met its quota or has no candidates left; minus every
`exclude` pin. **suite**: for every tag value the twenty-five records with the
highest `clusterVideos` that carry it (one per cluster), plus every tier 1 and
tier 2 record whatever its permission (the set file holds only ids and
reasons; a non-`full` record stays `gated` in the index). A record appears once
with every reason that selected it. Both are sorted by tier, then
`clusterVideos` descending, then id. Neither script takes `--only`.

## `contra/data/corpus/fixtures/<id>.json`: the public hand set

`derive-fixtures.mjs` copies the derived record of every `hand.json` dance
whose `permission` is `full` into the public repository unchanged, and copies
`index.jsonl`, `hand.json` and `suite.json` beside them. The fixture directory's
`README.md` states the arrangement (source, attribution, removal on request or
on permission change, never rendered by the site) and the contact. On every
run the script deletes any fixture whose current raw record is no longer
`full`, and any that has left the hand set, so the directory always equals
the rule.
