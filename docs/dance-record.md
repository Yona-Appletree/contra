# The dance record

What a `data/dances/<slug>.json` file holds, what each field means, and how to
turn a Caller's Box page into one. Written in M8 of the figure-model plan, which
is the milestone that widened the record far enough to hold the corpus.

A record is **JSON and nothing else**. It survives
`JSON.parse(JSON.stringify(dance))` unchanged, it never writes `from` or
`carried` (both are derived at load, and a file that writes one is refused), and
everything in it is either a fact about the dance or a parameter of a figure.

---

## The file

```jsonc
{
  "slug": "butter",
  "title": "Butter",
  "author": "Gene Hubert",
  "formation": "becket", // a formation id: duple-improper | becket | proper
  "status": "lab", // left out for a shipped dance; see "Lab status"
  "notes": "The Caller's Box 10320, permission: full.",
  "source": {
    "callersBoxId": 10320,
    "url": "https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10320",
    "permission": "full",
    "transcript": "A1  (2) Shift left  (6) Circle left 3/4  …", // verbatim
  },
  "passes": 2, // how many passes `phrases` holds; left out is one
  "progressEvery": 1, // passes between progressions; left out is one
  "progression": { "lark": 1, "robin": 3 }, // per-role, in dancing places
  "startPlaces": { "1L": { "p": [-16, 30], "facing": 0 } },
  "waitOut": { "joinBeats": 2 },
  "figures": { "go-forward": {} }, // dance-local figures; see below
  "phrases": [{ "name": "A1", "figures": [] }],
}
```

- **`source` is not decoration.** Every dance in this repository is a real,
  published contra whose figures come from that dance's own Caller's Box page,
  and the page's own `Permission:` field is quoted in `permission`. Nothing is
  reconstructed from memory
  (`docs/adr/2026-09-13-corpus-and-permission.md`). The `transcript` is the
  page's A1/A2/B1/B2 lines **exactly as they print**, including the counts and
  the notation, so that a reader can check the record against its source without
  leaving the file.
- **`notes`** is this repository's own commentary — what is encoded, what is
  owed, which reading was taken. `pnpm dance <slug>` prints it.
- **`progression`** is per role, in dancing places, and lives on the record
  rather than in `@caller/choreo` because "lark" is a contra word (AC7). Left
  out is `{ lark: 1, robin: 1 }`, the single progression.
  - **The long form carries a line swap** (M8b):
    `{ "places": { "lark": 1, "robin": 1 }, "line": "swap" }` is the same shift
    plus _everybody crosses to the other side of the set_, keeping the way they
    were travelling — the Caller's Box's `other; single, swap sides`, which is
    Rick Mohr's Anna's Reel. The flat form is the short form of the same thing
    with `"line": "along"`, so every record that writes one keeps meaning what it
    meant. A swap puts the other role on each line, which is why such a dance
    writes its second time through out with the roles exchanged rather than
    deriving it (Anna's Reel does, in the corpus, phrase for phrase).
- **`startPlaces`** says where the dance picks everybody up at beat 0 of every
  time through, in the group frame's own axes. Only a dance that starts
  somewhere other than the formation's stations needs it — a becket dance whose
  first two beats are the shift.

## A phrase, and a call

```jsonc
{
  "name": "A1",
  "figures": [
    {
      "figure": "allemande", // a figure id, or "<slug>/<name>" for a local one
      "beats": 8, // may be 0; see "Zero-beat calls"
      "who": "larks", // which dancers, within the group — or a relation; see below
      "group": "shadow-pair", // which partition of the set the call runs in
      "ends": "bottom", // which true end a widened group may reach
      "params": { "pairs": [["1L", "2L"]], "hand": "L", "amount": 1.5 },
      "call": "LARKS ALLEMANDE LEFT ONCE AND A HALF",
      "spokenBeats": 3, // override the rhythm estimate for this line
      "while": [], // calls danced beside this one; see "Concurrent calls"
    },
  ],
}
```

**Every phrase is the same length**, and a call may end anywhere inside one.
A phrase's length is the sum over its calls of "the longest of this call and the
calls beside it".

**`name` is a label.** `A1 A2 B1 B2` is the ordinary contra tune and is what
most records write, but 113 corpus dances have phrases beyond it and a two-pass
record writes its second pass as `2A1 … 2B2`. Nothing reads the four letters.

**`who` may be a relation** (M7b), as well as a tag the formation defines
(`larks`, `ones`, `all`) or a list of stations. For a figure danced by the whole
four it names **which four**: resolution takes _you, your partner, the dancer the
relation names, and their partner_, which is a ring that need not be a minor set.
Contrablend's `"who": "N1"` is the case — its B2 circle right three quarters is
four dancers out of two hands-fours, because B1 has rebound `partner` to the
shadow — and the lane is used for it only when the ring really does span two,
which is measured rather than declared. A relation that names nobody leaves that
dancer out of the ring and on hold-place, as everywhere else.

**`who` may be a written list of relations** (M9b, DD31), for the four a
transcript names **one dancer at a time**. The spelling is a `+`-joined string —
`"who": "self+partner+N1+N2"` — and it is a string rather than a JSON array
because an array `who` already means _a list of stations of one group_ and the
two would be indistinguishable. Every item is a relation word, `self` included,
and there have to be at least two of them; a `who` with no `+` in it is not a
list and resolves exactly as it always has.

The list is followed **from each active dancer, in the order it is written**, and
the four it finds are cast into the figure's parts in that order — so the record
says which of the four dances which part. It is the general case of the ring
above, which is `self + partner + <the relation> + <their partner>` with the
last two written for you. Jeremy Corners' A1 is the dance that needed it:
_"Interrupted square through 2 [with twos, W1, and N2 M1]"_ names four dancers
out of two minor sets and no group selector, tag or single relation says that.
The ordinary rules still hold: four distinct dancers or it is not a foursome,
nobody is in two of them, and a dancer any one of the relations leaves out —
the ends of the line — is left out of the call and dances hold-place.

## Shorthand and canonical parameters

A figure's parameters are its **canonical** ones — the `params.defaults` block of
its `FigureDefinition` — and a record may write any of them directly. Several
figures also take a **shorthand** that expands into one:

| figure   | shorthand              | canonical                                         |
| -------- | ---------------------- | ------------------------------------------------- |
| `hey`    | `amount: 0.5`          | `passes: "RR NL LR"` — the pass list, written out |
| `hey`    | `ricochet: "robins@2"` | the same list with `L!` on that pass              |
| `star`   | `amount: 0.875`        | `places: 3.5` — quarters of the ring              |
| `circle` | `direction: "left"`    | `places`, with its own sign                       |

The two compose rather than compete: `star`'s `amount` multiplies its `places`,
so `{ "places": 4 }` is once round exactly as it always was and
`{ "amount": 0.875 }` is seven eighths of it. **Write the canonical form when
the shorthand cannot say it** — Are You 'Most Done?'s "star left 7/8" and Anna's
Reel's `passes: "RL PR LL N2R"` are both cases where the caller's own words are
not one of the shorthand's values.

Four parameters are **not** figure parameters at all. They ride in `params`
because `FigureCall` is `@caller/choreo`'s and all four are contra words, and
the layer above the figure reads them and strips them out before any figure is
planned:

| parameter    | read by             | what it says                                                                                                                                                 |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rebind`     | the **set**         | `{ "partner": "shadow" }` — "when this figure lets go, whoever was your shadow is your partner" (Contrablend's "(new partner)")                              |
| `trade`      | **resolution**      | `true` — which of a same-role pair takes which figure-role (Q10)                                                                                             |
| `form`       | the **interpreter** | the shape this call forms, over the definition's own `ends` (Q6) — and a shape the figure has none of, which is how a call lands the set in a diamond (DD41) |
| `progresses` | the **set**         | `true` / `"end"` — the progression happens at the end of _this_ call, not at the end of the time through (M9b); `"start"` — at its start (DD43)              |

### `progresses`: the progression in the middle of the dance

The engine has always shifted the set's slots at the **cycle boundary**, because
that is where a contra dance usually progresses: the last figure leaves you one
place along and the boundary is where the set admits it. Some dances progress in
the middle instead, and the corpus writes several — Fatal Attraction's A1 is
_"neighbor promenade counterclockwise around the major set"_ and its A2 casts
back, so by A2 the dancers really are one place along and every call after that
names its neighbours from **there**. Left at the boundary, each of those calls
resolves against seating the dance has already left behind, and the dancer `N2`
names is a couple standing out.

`"params": { "progresses": true }` on that call says so. The shift is the
dance's own (the `progression` field, or the formation's), applied exactly as
the boundary applies it, so a role-asymmetric progression and a line swap mean
the same thing here as there. After it:

- **relations resolve against the shifted slots for the rest of the time
  through**, so the transcript's "N2" is written as `neighbors` from that call
  on — the record says what the engine resolves, and the caller's own word is
  kept in the call text and in `notes`;
- **the cycle boundary's own shift is dropped for that pass**, because a set
  progresses once per pass however the record writes it;
- **nobody moves.** What moves is the seating, exactly as at a boundary — which
  also means the couples standing out change there, so the pass is filled with
  `wait-out` one run of beats per seating rather than one per pass.

#### At the call's start, or at its end

`true` is `"end"`, and every record written before this meant the end.
`"progresses": "start"` puts the same shift **before** the call resolves, so the
call itself is danced by the seating it leaves the set in. The user's rule of
2026-09-15 (DD43) is that a figure in long wavy lines may take the progression
at its start; the general form is that a figure which _is_ the progression
carries the bodies across the shift while it dances, and where the seating
changes relative to it is the dance's own fact.

**Which one a dance wants is a measurement.** Fatal Attraction's is decisive and
it is worked in `planCycle.test.ts`: its A1 promenade round the major set has
already carried the bodies to N2's places when the cast-back begins, so its
cast-back writes `"start"` — and the dance's **closure went from 29.9228 px (odd
lengths) and 39.1798 (even) to 0.0000 at every checked length**, with its reach
18.3771/26.7595 px short becoming 12.0327/15.6049. Written at the end, the two
beats of the cast-back are danced by the seating the dance has already left.

## Concurrent calls (`while`)

The corpus writes `||`, and 735 dances use it; 189 more write "while".

```jsonc
{
  "figure": "allemande",
  "beats": 4,
  "params": { "pairs": [["1L", "2L"]], "hand": "R", "amount": 1 },
  "call": "LARKS ALLEMANDE RIGHT ONCE, ROBINS LOOP RIGHT",
  "while": [{ "figure": "loop", "who": "robins", "params": { "hand": "R" } }],
}
```

- A branch is an **ordinary call** in every respect but two: its `beats` may be
  left out (it takes the parent's), and it may not carry a `while` of its own.
- **The actors must be disjoint.** The planner checks it by name before anything
  is emitted, because the timeline enforces exactly that per dancer (Q13).
- **A dancer in neither is on hold-place** for the whole length. This is the
  reason the branches cannot be resolved one at a time: the robins looping are
  not standing through the larks' allemande, and a per-branch complement would
  put every one of them in a figure _and_ on hold-place at the same beat.
- The **card** draws it as one row with two lines; the **walkthrough** teaches
  each half as its own step; a **seam** is every figure of one step into every
  figure of the next.

## Zero-beat calls

`"beats": 0` is a call that takes no music: "face your neighbour", "form a wave".
44 corpus dances have one. It is a fact about where you end up rather than
something the dance spends beats on, so the phrase's arithmetic is unchanged and
the figure's **ends** are what it is for. A negative count is still refused.

A figure only means something at no beats if its ends are **structural** — read
off the shape rather than off how far through the count it is. Every `waypoints`
figure is (its ends are the last leg's own pose), which is `turn-alone`, `loop`,
`cast-back` and the two `go-*-outside` figures. A figure whose ends are a ramp
would answer "exactly where it started".

## Passes

A record may hold more than one **pass** — one time through the tune — and write
them out, because the corpus writes them out: Anna's Reel's second pass
exchanges the roles throughout and is not derivable from the first.

```jsonc
{
  "passes": 2,
  "phrases": [
    { "name": "A1" },
    { "name": "A2" },
    { "name": "B1" },
    { "name": "B2" },
    { "name": "2A1" },
    { "name": "2A2" },
    { "name": "2B1" },
    { "name": "2B2" },
  ],
}
```

- **The phrase list is flat**, all passes in order, so nothing that walks a
  dance's figures has to know about passes at all. `phrases.length` must divide
  by `passes` and every pass must be the same number of beats.
- **The progression fires at the end of every pass**, not at the end of the
  record — which is what a single-progression two-pass dance means. A record
  whose two passes share one progression says `"progressEvery": 2`.
- One time through **the record** is both passes; `danceBeats` is 128 for a
  two-pass dance, and the card draws eight rows.

## Dance-local figures

D10: a dance may carry figure definitions of its own, for the figure no other
dance in the corpus asks for.

```jsonc
"figures": {
  "go-forward": {
    "call": "GO FORWARD",
    "describe": "…",
    "lead": 2,
    "nominalBeats": 2,
    "roles": ["one"],
    "actors": "each",
    "anchor": "centroid",
    "params": { "kind": "canonical", "defaults": {} },
    "shape": { "kind": "waypoints", "tracks": {} },
    "holds": [],
    "ends": "home",
    "timing": { "stretch": "distance", "profile": "smooth" },
    "texts": { "walkthrough": {}, "call": {} }
  }
}
```

- The value is a `FigureDefinition` written out in full **but for its `id`**,
  which is supplied as `<slug>/<name>`; a call names it that way
  (`"figure": "fatal-attraction/go-forward"`), so a reader always knows where to
  look and two dances cannot collide.
- Its four **texts** go in the same literal, under `texts`, in exactly the shape
  `data/figures/<id>.json` has — so that the whole figure is one thing in one
  place.
- **Promoting one is a copy**: move the literal into
  `packages/contra/src/library/figures/<name>.ts`, its texts into
  `data/figures/<name>.json`, drop the slug from the calls that name it, add a
  row to `packages/contra/README.md`. Nothing else changes.

## What the caller says: `call`, `callBudgets`, `teach`

Three fields, and all three exist because everything **else** the app says about
a dance is derived and never stored (M13; `docs/move-texts.md`).

- **`call`** on a figure is a **flourish**: the one line a caller says here that
  no form of the figure can say. Everything else — "SWING YOUR PARTNER", "CIRCLE
  LEFT THREE PLACES", "ROBINS CHAIN TO YOUR PARTNER" — comes out of
  `data/figures/<id>.json`'s three call forms with the call's own parameters and
  the dancer it names filled in, and out of the **resolution** for a chain's
  target. A record that writes one anyway is refused by
  `loadDances.test.ts` if any form can say it.
- **`callBudgets`** is how many beats of words each time through gets, 1-based,
  the last repeating: left out is `[4, 2, 2, 1]`, the whole sentence, then the
  middle form twice, then a word. No dance in the programme writes one.
- **`teach`** is a caller's own edits to this dance's walkthrough, keyed
  `<phrase>/<figure>` — `"A2/robins-chain"`, `"B1/balance-ring/2"` for the second
  of two in one phrase, `"A2/loop"` for a concurrent branch, and `opening` and
  `wrap` for the two dance-level sentences. Each edit writes any of `before`,
  `after` and `replace`. A key that names nothing **warns** at load and the rest
  of the dance loads, because a stale key after a re-encoding must not take a
  dance off the programme.

## Lab status

`"status": "lab"` is a dance that is being worked on. It loads like any other, is
reachable by `pnpm dance <slug>`, by `#/dances/<slug>` and by `#/dance/<slug>`,
and is **excluded** from the programme — so the demo never shows a dance that
does not dance. The record's `notes` say what is still owed. It moves out of the
lab and into `data/dances/programme.json` when it is green at every checked line
length.

## Candidate readings

`data/dances/lab/<slug>~<id>.json` is **one caller's reading of a record**, and it
exists to be shown: five dances are blocked on a question no measurement can
answer — _where does this dance physically carry its progression?_ — and the way
to ask it is to dance the alternatives side by side and let a caller point.
`#/lab/dance/<slug>` is the page that does that; [the dance lab](./dance-lab.md)
describes it.

A candidate is **not** a copy of the record. `data/dances/<slug>.json` stays the
transcript's, untouched, and the candidate file holds the two or three clauses
the reading adds and nothing else — which is also what a reviewer wants to read,
because the clause _is_ the reading.

```jsonc
{
  "of": "the-set-monster", // the record this reads
  "id": "contradb", // unique within that dance
  "title": "ContraDB's ¶", // what the column is called
  "assumes": "Three places, taken one at a time…", // one line, in a caller's words
  "quotes": "ContraDB: “6: ladles balance & pull by right…”", // the words it rests on
  "source": { "name": "ContraDB 2068", "url": "https://contradb.com/dances/2068" },
  "notes": "…", // anything a reader of the file needs told
  "progression": { "lark": 1, "robin": 1 }, // replaces the record's own, where the reading changes it
  "patch": [
    { "at": "A2/2", "params": { "progresses": true } },
    { "at": "B1/0", "who": "N1" },
    { "at": "B1/2", "params": { "pairs": "N2", "progresses": true } },
  ],
}
```

- **`at` is `"<phrase>/<index>"`** — the phrase's own name and the call's
  zero-based place in it, which is how a record is read aloud ("B1's second
  call") and the only two coordinates a phrase list has. A **concurrent** call is
  addressed by its parent: a `while`'s branches are one call, and `progresses` is
  read across all of them.
- **`params` is merged** over the call's own. `null` **removes** a parameter,
  which is how a reading moves a clause the record already has: a set progresses
  once per call that claims it, so a reading that puts the shift somewhere else
  has to take the old one off.
- **`who`** replaces the call's own, for a reading that changes who a call is
  with. A reading that moves the shift earlier moves what `N2` means after it, so
  the relations usually move with the clause.
- A candidate may say **nothing else**. In particular **`startPlaces` is not a
  candidate** and the file has no way to write one: moving a dance's first places
  moves the number the oracle reads without moving a dancer, which is
  oracle-tuning. The question is where the _dancing_ carries the shift.

A candidate loads as a dance called `<slug>~<id>`, and
**`pnpm dance <slug>~<id>` measures it** like any other. It is in nothing else:
not in `ALL_DANCES`, not in the programme, no card, no Stage page, no trace
plate — everything that walks the corpus keeps seeing exactly the files in
`data/dances/`. `LAB_CORPUS` is the list that has both.

Where **ContraDB** has a page for the dance it is worth reading first: its figure
list prints a pilcrow (`⁋`) against the figure that carries the progression,
which is this question answered by the people who catalogue the dance. Two of the
five acceptance dances have one.

---

## The Caller's Box notation, and what it maps to

The corpus writes its figures in a compact notation. This is the whole of it, and
what each part becomes in a record.

| Caller's Box                 | means                                               | in a record                                |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------ |
| `W`                          | the women — this repository's **robins**            | `R` in a pass list; `pairs: [["1R","2R"]]` |
| `M`                          | the men — this repository's **larks**               | `L` in a pass list; `pairs: [["1L","2L"]]` |
| `(8)` before a figure        | its count in beats                                  | `"beats": 8`                               |
| `A1` / `2A1`                 | the phrase, and the pass it is in                   | `phrases[].name`, with `passes`            |
| `N2`, `N3`, `S2`, `C1`       | an indexed relation                                 | `pairs: "N2"`, or `who: "N2"`              |
| `[with N2]`, `[with shadow]` | a **group selection** — which four the call runs in | `"group": …` where the formation has one   |
| `\|\|`                       | concurrent: two calls at once                       | `"while": [ … ]`                           |
| `while`                      | the same word, spelled out                          | `"while": [ … ]`                           |
| `~` on a hey's last pass     | the hey **ends short** there                        | `NL~` in the pass list                     |
| `(t1;t2;…)` after a hey      | the pass list, one token per meeting                | `params.passes`, `;` → a space             |
| `X pull by R`                | that pass is a pull by, that hand                   | `mode: "pull-by"` in the schedule          |
| `M ricochet`                 | that centre pass is a bounce                        | `L!` in the pass list                      |
| `(W2-M1-W1-M2)`              | a line's **order**, read from one fixed side        | `params.order`                             |
| `; form wave of four`        | an exit clause: the shape you end in                | `params.form`, or a zero-beat call         |
| `; face N2`                  | an exit clause: who you end facing                  | a zero-beat call                           |
| `(new partner)`              | a rebinding                                         | `params.rebind`                            |

A pass list's own tokens are **who then shoulder**: `WR;NL;MR;PL` is "the robins
by the right, your neighbour by the left, the larks by the right, your partner by
the left", and it normalises into this repository's spelling as
`RR NL LR PL`. Odd positions are the centre pair and even ones the side pass, so
a role word is a pass for two and a relation word is a pass for four. The plain
pass list covers about 85% of the corpus's hey lines verbatim; the rest are a
per-role **schedule** of `{ meet, shoulder, mode, at, short }` items, which the
pass list expands into.

---

## A translator's checklist

Turning one Caller's Box page into a record, in order. Every step is something
that has gone wrong at least once.

1. **Copy the transcript verbatim** into `source.transcript`, counts, notation
   and all, and record `callersBoxId`, `url` and the page's own `permission`.
   If the permission is not `full`, stop: the figures may not be stored.
2. **Name the formation.** `duple-improper`, `becket`, `proper` — and read what
   the page says beside it ("improper", "becket", "single, swap sides").
3. **Write the phrases with their counts first, figures second.** Check each
   phrase sums to the same number. A phrase that does not is a transcription
   error nine times in ten.
4. **Translate `W`→robins and `M`→larks**, everywhere, including inside pass
   lists. This is the single most common mistake.
5. **Each call names a figure id.** If there is no figure for it, either it is a
   figure a later milestone owns (leave the call, add the id to
   `UNSUPPORTED_FIGURES` with that milestone, and the dance stays `lab`) or it is
   a **dance-local figure**.
6. **Write the pairing as a relation word** (`"partners"`, `"neighbors"`,
   `"N2"`) rather than as stations wherever the transcript names one. Stations
   (`[["1L","2L"]]`) are for "the larks", which is a role and not a relation.
7. **`||` becomes `while`**, with the branches' actors disjoint.
8. **An exit clause is its own call** — a zero-beat one — or a `form` parameter.
9. **A second pass is more phrases plus `passes`**, named `2A1 …`.
10. **Write a `call` only for a flourish** (M13). What the caller says is
    **derived**: every figure writes three call forms in `data/figures/<id>.json`
    — a whole sentence, a middle form and a word — and `callScript` picks the
    longest that fits the room the call before it leaves and the register this
    time through is in. So a `call` in a record is for the line no form can say:
    Butter's "SHIFT LEFT", After the Solstice's "AND SWING", The Carousel's
    "FULL HEY FOR FOUR". `loadDances.test.ts` refuses one that any form can say,
    and refuses the encoder's own vocabulary ("ONE AND A HALF", "THREE
    QUARTERS", "LADIES") in the ones that stay.
11. **`status: "lab"`**, always, to begin with.
12. **A selection the library cannot say is a reading, and it goes in `notes`**
    (M9). Three of them turned up in the two Banner dances and none is a bug:
    a group selection that names four dancers out of two minor sets one by one
    (_"[with twos, W1, and N2 M1]"_ — **answered in M9b** by the written
    relation list above, `"who": "self+partner+N1+N2"`, which is the one of the
    three that turned out to be a missing notation rather than a reading); a
    transcript token that cannot be read at all (_"Square through 2
    (NR;SRNL)"_); and a figure called for **half of itself** (_"(4) In long
    lines, go forward (facing out)"_, where `long-lines` goes forward and back
    in whatever count it is given and has no parameter for either half). Write
    the nearest thing the library does say, and write down in `notes` what the
    transcript said and what you wrote instead. Do not invent a parameter for
    one dance.
13. **`pnpm dance <slug>`.** Read it from the top: section 0 says what figures
    are still owed, 1 is who dances what, 2 is the oracles at every line length,
    3 is who the ends leave out, 3b is how far off a stated shape anybody is, and
    4 is the motion. Green at every length is what earns a place in
    `data/dances/programme.json`; anything else stays in the lab with its own
    `notes` naming the one thing, measured.
