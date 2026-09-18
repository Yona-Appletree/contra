# @caller/lang

The dance language, **draft 3**: a program is a tree of **groups** built once,
with dancers as its leaves, and a **script** every dancer runs against that
tree, one beat at a time. Space is the tree; time is the order of the script;
everything a dancer knows, it knows from the groups above it.

Design: `Planning/contra/dance-language-design.md`. Plan:
`Planning/contra/2026-09-17-1758-dance-language-spike/`.

## Allowed imports

**None.** `@caller/lang` imports no workspace package. It sits beside the
engines, not on top of one: no geometry, no renderer, no figures — a move's
body is the name in its `ir`, and the kinematics are somebody else's problem
(§7). `scripts/check-deps.mjs` says so from the outside and
`src/allowedImports.test.ts` from the inside.

`@caller/kinetics` **consumes its timeline** — the evening's moves, events and
snapshots, through `packages/kinetics/src/sequence/fromLang.ts`
([the ADR](../../docs/adr/2026-09-18-kinetics-consumes-lang.md)) — so a
`.dance` file is the one text a dance has, from the tree to the pixels. The
edge goes one way: nothing here knows that engine exists.

## What is not there

No formatter and no linter — round 2 shipped both; draft 3's grammar (trailing
blocks, prefix modifiers, one pattern grammar in four places) needs its own
before a `.dance` file can be held format-stable. No evening syntax — `× 7`,
seating, dispersing are named in the design (§5) but the evening is a plain
TypeScript function (`runEvening`), not a language. No moves' bodies — a move
is `ir "swing"`, a name the kinematics reads; the motion behind it is
somebody else's problem (§7), same as the geometry, the renderer and the
figures this package does not import. (The join with
`packages/kinetics` itself has happened: see "Allowed imports" above.)

## What is here

| Path                   | What                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/syntax/lexer.ts`  | Tokens. Casing is grammar: kebab names, TitleCase groups, types and enum members.                                                                                                           |
| `src/syntax/parser.ts` | `parseFile(text, name)` — recursive descent to the tree, or one diagnostic.                                                                                                                 |
| `src/syntax/ast.ts`    | The tree. Every node carries a `Span`; nothing is resolved.                                                                                                                                 |
| `src/load.ts`          | `loadProgram(path)` — the prelude, the file, and every module it names. `loadAllTexts` is the same read with every file its own root, for `eval/loadForEval.ts` (below) and the playground. |
| `src/check/check.ts`   | `check(program)` — the rules, as diagnostics; `checkProgram` also hands back the table.                                                                                                     |
| `src/eval/`            | The two passes: `buildTree` lays the floor, `runDance` scripts a time, `runEvening` repeats it.                                                                                             |
| `src/diagnostics/`     | `Diagnostic`, the codes, and rustc-shaped rendering — text and JSON.                                                                                                                        |
| `dances/`              | The fixtures: the formations, the pair, Butter, a medley, and the deliberate errors under `broken/`.                                                                                        |
| `cli/lang.mjs`         | `pnpm lang check\|tree\|run` — one command over one file.                                                                                                                                   |
| `playground/`          | A vite root: the six panes, dark, on 5178. Nothing else imports it.                                                                                                                         |

## The language in one screen

A formation's shared parts — `contra.dance`, read by every fixture:

```text
group Couple {
  id: enum { Ones, Twos }
  seated: Bool = true
  spacing: Length = 0.8m
  body {
    left(spacing / 2)  Role(Lark,  seated = seated);
    right(spacing / 2) Role(Robin, seated = seated);
  }
  partner = other(Role);
}

fn swing(with: Role, beats: i32 = 8) { ir "swing"; }   // an `ir` makes it a move
```

And a dance on top of it — `butter.dance`, one phrase of four:

```text
use contra::{Phrase, phrase, shift, circle, swing, long-lines, chain, hey, balance};
use becket::{MajorSet, MinorSet};

fn butter(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }      // a `setup` makes it a dance
  card "Butter";

  phrase(A1) {
    if (first-time) {
      circle(MinorSet, Left, places = 3, beats = 8);
    } else {
      progress();                                   // the event, set-wide, at beat 0
      shift(Left, beats = 2);                       // its motion
      circle(MinorSet, Left, places = 3, beats = 6);
    }
    swing(neighbor, beats = 8);
  }
  // …A2, B1, B2 — see dances/butter.dance whole.
}
```

- **The group is the one first-class idea.** Declared once, invoked to build a
  node, and named in an expression to mean _mine_ — no `self`, no sigil.
- **No dots.** `id(K)`, `other(K)`, `dancers(K)`, `anchor(K, name)`, `one!(…)`,
  `count(…)` reach everything.
- **One pattern grammar** (Rust's) in four places: `is`, `match`, `select` and
  `assign`. `_` is the only wildcard; `other`, `first` and `last` mean something
  only where there is a candidate to compare against the reader.
- **One keyword, `fn`**, for a move, a compound, a dance and a medley; the
  checker tells them apart by `ir` and `setup`.
- **A file is a module.** `use becket::{MajorSet};`, or the qualified
  `improper::MajorSet`, which needs no import at all.
- **Events commit at the end of their beat.** `assign(K = …)` is the event and
  is a `Bool`, so `or` chains fallbacks; `progress()` is set-wide.
- **Beats are a plain count** (`beats = 8`). The two units are `m` and `deg`.

### Three places this parser bends the written grammar

1. A group invocation may carry **one trailing statement**, not only `;` or a
   block — design §8 writes `Station(OutTop) Couple(Ones, seated = false);`.
2. **Any expression is a pattern**; the design's parentheses round a computed
   pattern are optional, which is what lets §8's
   `select(MinorSet = id + travel, …)` stand as written.
3. **A block's last expression, written without a `;`, is its value** —
   `fn wrap(n: i32) { ((n - 1) % 4 + 4) % 4 + 1 }`.

## What the checker knows

A group is declared once and invoked to build a node, so **the paths from a
dance's floor down to its dancers are lexical** — read off the nesting of
invocations, `for` and `if` and all. Nearly every rule is a question about
those paths, answered before anybody dances:

- **Whose `neighbor`?** A relation is a member of a group and every group above
  a dancer lends its members to that dancer. Reading one where not every path
  has that group is an error in a body or on a group — narrow it first, by
  matching on the kind that tells the paths apart. In a dance's script the same
  read is the dance's **contract** instead: the couple at the end of the line
  has no `MinorSet`, so it is out, and runs the floor's `out`.
- **Can `one!` hold?** `other(Role)` over two ids is one and needs no `!`;
  `other(Couple)` over three is two of them, and `one!` on it cannot hold.
- **Is this `match` exhaustive**, is `other` in a place that has a candidate to
  compare against, does this `assign` land on a branch that has the kinds it
  names, do two dances composed stand on one floor, and — since a move says its
  beats — **does `phrase(A2)` start on beat 16**.

`checkProgram` hands back a **resolution table** beside the diagnostics: what
every name binds to, what every call calls, what each `fn` is (an `ir` makes a
move, a `setup` makes a dance), each dance's floor, contract and length, and
the path shapes below every group. The evaluator and the playground read it
rather than working it out again.

## Running one

`setup` runs **once, for nobody** and builds the tree; the script runs **once
per dancer** against it, in lock step, and the events of a beat commit together
at the end of it.

```ts
const program = loadDanceDir("packages/lang/dances");
const evening = runEvening(program, findDance(program, "butter")!, {
  times: 7,
  args: hallFacts({ "minor-sets": 3 }),
});
console.log(printTree(evening.tree)); // the floor, OpenSCAD's CSG shape
console.log(printTimeline(evening)); // events by beat, then a row per move
```

- **A dancer is a person, not a place.** Its name is minted at setup from where
  it started (`0-1L`, `OT-1R`) and never changes; what the progression moves is
  which place holds it.
- **The out couples are in the tree.** A dance's contract is the kinds it reads,
  and a dancer whose path lacks one of them runs the formation's `out(length)`
  while still taking part in the set-wide `progress()`.
- **Beat 0 is the top of the dance, and membership settles there.** The couple
  the progression carries off the end stops where it stands and waits out the
  rest; the couple waiting at the end enters on the same commit and dances that
  time through, shift and all, so nobody is ever asked to swing somebody who is
  waiting out. Whether a dance that progresses in the _middle_ should admit and
  release dancers the same way is a G1 question, and the rule is deliberately
  restricted to the beat-0 commit until it is answered.
- **A commit is where the diagnostics live.** Two dancers in one place names the
  pair and the beat (`L102`); half a role swap is exactly that.
- **`+y` runs down the hall.** The hall's top is at negative `y`, the minor sets
  are laid at increasing `y`, a couple travelling `+1` in set id travels along
  `+y`, and a heading of 0 faces down the hall (`src/eval/frame.ts`). A picture
  wants the top at the top, so the playground's floor pane draws the hall turned
  through 180° — a rotation, so left stays left.

### What a move hands on

A `Move` is a leaf — an `ir` name, the beats it spans, and its arguments
already resolved for the dancer who made it. Two fields are for a **consumer**
rather than for a reader (notes D3):

- **`arg.ref`** — what the argument points at, beside the `value` text a
  person reads. A dancer is `{ t: "dancer", id }`; a place somebody is standing
  in is that somebody; an empty place is `{ t: "node", path }`, which reads as
  nobody; an enum member or a number has no `ref` at all. So a consumer casts
  from the timeline without ever parsing `0-2R` back into a person.
- **`move.span`** — the call in the text, so a complaint from three layers
  down (`no figure for "chain"`) can point a caret at the line that asked.

`@caller/kinetics` is the consumer: `src/sequence/fromLang.ts` turns an
evening into its own compiled sequence with these two fields and the
snapshots, and nothing else.

## Diagnostics

Codes are stable and banded: `L001–L009` parse, `L010–L099` check, `L100–` run.
The shape is round 2's (`packages/kinetics/src/diagnostics/`), rustc's really:
a code, a message, a span with a caret, the beat and the dancers, a trace of
the facts on the way down, and a suggestion.

```text
error[L007] no sigil: "$partner" has a sigil the language does not have
  --> butter.dance:12:9
   |
12 |   swing($partner, beats = 8);
   |         ^^^^^^^^
   = help: a relation is a member of a group and is read bare: write "partner"
```

## `pnpm lang`

One command, one file, three things to ask of it. It runs the sources
directly (`scripts/ts-src-resolve.mjs`, the same loader `pnpm dance` uses), so
there is nothing to build first, and it exits non-zero the moment anything is
an error.

```bash
pnpm lang check packages/lang/dances/butter.dance
pnpm lang tree  packages/lang/dances/becket.dance --minor-sets 4
pnpm lang run   packages/lang/dances/butter.dance --times 7
```

| Command | What it prints                                                            |
| ------- | ------------------------------------------------------------------------- |
| `check` | the parse and check diagnostics, rustc-shaped (`renderText`), or `--json` |
| `tree`  | `printTree` of what `setup` built                                         |
| `run`   | `printTimeline` for every time through, then the diagnostics              |

Options: `--dance <name>` (default: the first `fn` with a `setup` in the file),
`--minor-sets <n>` (3), `--times <n>` (1), `--json`. A fixture under
`dances/broken/` reads the formations one directory up, as the loader does.

A **formation** file declares a floor and no dance — `becket.dance`,
`improper.dance` — and `tree` and `run` still work on one: the CLI stands the
file's root group up in a one-line dance of its own
(`becket::MajorSet(1, minor-sets = …)`) and says so on stderr, so a pipe reads
the tree alone.

## The playground

```bash
pnpm --filter @caller/lang dev     # http://localhost:5178
```

Also `.claude/launch.json`'s `lang-playground`, and
`pnpm --filter @caller/lang build`, which puts a static copy in
`dist/playground/`. The `.dance` files are bundled as text, so the page reads
no disk and every edit re-runs the whole pipeline.

Six panes, one evaluation behind all of them:

| Pane          | What it shows                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`      | every `.dance` in `dances/`, editable, re-evaluated as you type; the `use`d modules as chips                                                                               |
| `tree`        | `printTree`: the floor, its frames, the dancer at each leaf                                                                                                                |
| `events`      | every commit beat of the evening, `dancer: from → to`, with the path segments that did not change elided to `…`                                                            |
| `timelines`   | a row per dancer across the evening's beats — moves as bars, commits as ticks; drag to scrub                                                                               |
| `floor`       | the hall from above at the **last commit on or before the scrubber's beat**: positions at rest (D6), lark gold, robin red, a heading tick, an empty place as a hollow ring |
| `diagnostics` | the same text `pnpm lang check` prints; click one and its span is selected in the source                                                                                   |

Controls: the dance `fn`, `minor-sets`, `times`, and one scrubber over the
whole evening. The floor never shows motion — the language says where a dancer
stands between commits and nothing about the way there, so neither does the
pane.

## Validation

```bash
pnpm --filter @caller/lang test
pnpm --filter @caller/lang typecheck
pnpm lang check packages/lang/dances/butter.dance
pnpm lang run packages/lang/dances/butter.dance --times 7
```
