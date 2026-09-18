# The dance language, draft 3: the group is the one first-class idea

Date: 2026-09-17
Status: accepted (G1, 2026-09-17 late evening)

**Supersedes [2026-09-17-dance-language.md](./2026-09-17-dance-language.md).**

## Context

That earlier ADR's reading — a `$`-sigil bound from the tree a dancer stands
in, three module kinds (formation, dance, move), a group **providing** `$`
variables — was proposed against round 1 of the language, before it was built.
Writing round 2 against it (`packages/kinetics`, PR #104) surfaced a generic
layer underneath the sigil: maps, records, `self`, `kind`, `module`, dots —
machinery for reaching a value that was, underneath, always the same shape: a
node of the tree, or something read off one.

Design draft 3 (`Planning/contra/dance-language-design.md`) cut that layer and
made the **group** the one first-class idea instead: declared once, with an id
type, parameters, a body and members; invoked to build a node; named in an
expression to mean _mine_, with no sigil and no `self` because the reader is
implicit, OpenSCAD's `$` without the `$`. Yona's rulings of 2026-09-17
afternoon and evening carried this in, in his own words: _"everything is in
relationship to groups … 'the major set' is a group, 'the minor set' is a
group, 'partner' is a group, and the selections act on groups"_; _"the script
for a move … declares what groups (and their types) it expects"_; and, of the
model itself, that rulings made quickly should be revisited with judgement —
_"if you have a good reason and its not huge, do it, just justify it"_ — which
is why this ADR's Decision below is draft 3 **as built**, morphs included,
rather than draft 3 as written.

The rest of that afternoon's rulings, carried into the spike plan's `notes.md`
and built without a further gate:

- **Relations are members of the group declaration**, not a `$`-`provide`
  pair: the body runs once, for nobody, to lay the tree; the members are read
  later, by a dancer under the node. Two groups on one path declaring the same
  member name is a check error naming both, not a resolution rule.
- **No dots.** `id(K)`, `other(K)`, `dancers(K)`, `anchor(K, name)`, `one!(…)`,
  `count(…)` reach the domain values that a dot-chain used to.
- **One pattern grammar**, Rust's, shared by `is`, `match`, `select` and
  `assign`; `_` the only wildcard; `other`, `first` and `last` mean something
  only where there is a candidate to compare against the reader, so they are
  select/assign-only and the checker says so anywhere else.
- **`assign`, not `go`**, for the event; it is a `Bool`, so `or` chains
  fallbacks, and events commit together at the end of their beat.
- **One keyword, `fn`**, for a move, a compound, a dance and a medley — the
  checker tells them apart by whether the body has an `ir` (a move) or a
  `setup` (a dance), everything else being composition.
- **A file is a module**, Rust's `use a::{b, c}` / a qualified `a::b`, so two
  formations may declare the same name (`Couple`) without collision, and a
  dance that stands on one never mentions the ends explicitly.
- **The dance is one time through**; the evening — a plain TypeScript runner,
  not a language of its own yet — repeats it, seats the formation, and owns
  `first-time`/`last-time`.
- **A dance's contract is the kinds it reads**, found by walking its calls; a
  dancer whose path lacks one of them runs the formation's `out` for the
  dance's length instead, and the dance text never says so.
- **`progress()` is set-wide**: the first call at a beat evaluates the
  formation's `progress` for every dancer at that beat, in or out, so an
  entering couple and a leaving one commit together.
- **Base types**: `enum`, `i32`, `f64`, `Bool`, `fn`; no records, no maps, no
  generics. Expressions are a strict JavaScript-semantics subset; nothing in
  them is invented.
- **`f64` while computing, `i32` millimetres at rest**: a length or an angle
  is `f64` in the arithmetic that produces it and rounds to a stored fact (a
  frame, a diagnostic's number) once.
- **Its own language**, not a further TypeScript DSL — the spike plan
  (`Planning/contra/2026-09-17-1758-dance-language-spike/`) built a lexer and
  parser from nothing rather than embedding in an existing one, because the
  grammar (group declarations, patterns, `use`, `fn`, trailing blocks, prefix
  modifiers, no `$`) is different enough from round 2's that reuse would have
  cost more than a fresh start.

## Decision

Draft 3, built as `@caller/lang` (PR #105) and put in front of Yona at G1 on
`butter.dance`, three minor sets, seven times through: a lexer, a parser, a
checker with traced diagnostics, a two-pass evaluator (`setup` once for
nobody, a script once per dancer, an evening that repeats one time through),
a CLI (`pnpm lang check|tree|run`) and a playground debugger (source, tree,
events, timelines, floor, diagnostics — all six panes, no motion, no
kinematics). Ten acceptance fixtures under `packages/lang/dances/` are the
proof: becket at one, two and three sets; improper coexisting with becket
behind `use`; a triple-minor selection that cannot be `one!`'d; a square's
wrap-around `corner` with no `Station`; Butter run seven times with the ends
running `out`; a one-sided role swap caught as a pair-and-beat diagnostic; a
medley whose two dances disagree on their floor; a broken progression naming
the pair and the beat it collided on; the nine check-time error codes, each
with a span and a trace; and trailing blocks, closures and defaults.

_"This seems good … I think ship either way now"_ — G1 passed, `fn` and
`Station` (the open names at planning) were both kept, and the morphs below
were accepted as part of the decision rather than sent back for a redo:

- **A group invocation may carry one trailing statement**, not only `;` or a
  block — design §8 writes `Station(OutTop) Couple(Ones, seated = false);`,
  which the written grammar's `';' | block` did not cover.
- **Any expression is a pattern**; the parentheses the design put around a
  computed pattern are optional, letting `select(MinorSet = id + travel, …)`
  stand exactly as §8 writes it.
- **A block's last expression, without a `;`, is its value** — a JS-subset
  enough rule to let `fn wrap(n: i32) { ((n - 1) % 4 + 4) % 4 + 1 }` be a fn
  whose body is one expression, needed for the square fixture's `corner`.
- **A parameter's type resolves in its declaring module**, not the caller's —
  `chain(Robin)` finds `Role` from `contra.dance` without the caller
  importing it, because the checker reads a moved parameter's declared type
  where the fn is declared.
- **A dance fn called from a dance fn re-bases `beat` to 0** for the callee —
  needed for `phrase`'s beat assertions to hold inside a medley's second
  `butter()` call the same as its first.
- **`select` yields occupied places; `assign` ranges over every place** — the
  asymmetry a selection (reading who's there) and an assignment (deciding who
  goes where, including an empty place nobody has reached yet) actually need.
- **Becket and improper's out couples are seated, not empty.** The design
  wrote the ends `seated = false` for an empty hall at the top of the evening,
  but the progression below is then not a permutation of the places: a minor
  set at the boundary runs half empty and a dancer's `neighbor` names nobody.
  Seated, the same commit logic is a bijection on `2n + 2` places, which is
  what §8's own prose already described ("the couple waiting at `OutBottom`
  on set 2 as twos"). The seated-ends model versus half sets waiting in place
  is carried forward as an open question, to be judged with motion once the
  language joins the kinetics stack.
- **A commit can carry a dancer out mid-dance**: it stops where it stands and
  waits out the rest, rather than the model assuming everyone's contract is
  fixed for the whole time through.
- **A dancer the beat-0 commit brings in dances that time through** — entry
  is not restricted to standing out for the whole time the way it was first
  read; whether the same should hold for a commit in the _middle_ of a dance
  is open, deferred to the overnight plan that puts a real dance's motion
  behind it.
- **`+y` runs down the hall, heading 0 faces down the hall** — a concrete
  choice draft 3 left unstated; the playground's floor pane turns the drawing
  180° so the picture still puts the hall's top at the top.
- **`duplicate-center` (the design's own example fixture name) is not a
  fixture**: `center` is every group's undeclared origin and cannot collide
  by construction: the collision this item was meant to demonstrate is two
  groups on one path declaring the same _member_ name, which the fixture was
  renamed `duplicate-member` to test instead.

## Alternatives considered

- **Maps, records, `self`, method-per-shape `select`.** This is round 2's own
  reading, and the ADR it is superseding; rejected because every one of these
  turned out to be a group under another name — a record with named slots is
  what a group's parameters already are, `self` is what "the group above the
  reader" already means without a keyword, and a `select` with one method per
  shape is one pattern grammar wearing a different hat per call site.
- **`go` for the event.** Rejected for `assign`: the event is exactly setting
  a group's id to a pattern match, the same shape `select` already has, and
  `assign` says that; `go` would have needed its own argument grammar.
- **Two keywords, `move` and `dance`, instead of one `fn`.** Rejected: a
  compound (a phrase wrapper, a medley) is genuinely both — neither a leaf
  move nor a dance with its own floor — and giving it a third keyword would
  have meant deciding, ahead of any fixture, where composition sits between
  the two. One keyword and a checker rule (`ir` makes a move, `setup` makes a
  dance) reads that off the body instead of asking the writer to declare it.
- **Dots** (`MinorSet.center`, `couple.partner`). Rejected as the one thing
  the design explicitly ruled out: functions and patterns reach every domain
  value, and the one place a dot could have come back — `anchor(K, name)` for
  an anchor read from outside its own group — is spelling, not a dot.
- **Empty out-couples, per the design's §8 as written**, against seated ones.
  Rejected once the fixture proved it: an empty end couple breaks the
  progression's bijection at the boundary (above), and seated matches what
  §8's own prose already said about the commit. Carried forward as open
  rather than closed outright, since it is a claim about _motion_ — how a
  couple should look while it waits — that a text-only spike cannot settle.

## Consequences

- **Round 2's language, in `packages/kinetics` (PR #104), is superseded.**
  Its `$`-sigil, three-module reading, and generic layer (maps, records,
  `self`) are the thing this ADR replaces; `packages/kinetics`'s own kinematics
  and executor work is untouched and keeps running on the old text until a
  later round joins the two stacks. `AGENTS.md`'s dependency table already
  marks `@caller/lang` as importing nothing and being imported by nothing —
  the two packages are not wired together yet.
- **A formatter and a linter are follow-ups**, not shipped with the spike;
  round 2 had both, and draft 3's grammar (trailing blocks, prefix modifiers,
  one pattern grammar in four places) needs its own before a `.dance` file in
  the repo can be held format-stable the way round 2's ADR asked for.
- **The evening as a language — `× 7`, seating, dispersing — is still
  TypeScript**, named in the design (§5) but not designed; `runEvening` is a
  function, not a syntax.
- **Moves' bodies stay `ir` names**, TypeScript closures the kinematics reads
  by string; replacing them with the language itself is the join with the
  kinetics stack the ADR above defers, not this one's job.
- **The seated-ends model, mid-dance entry, and the evening as language** are
  the three open questions carried to the overnight plan (join the kinetics
  stack so Butter animates from `@caller/lang`'s own timeline; then Robins on
  a Wire; then the torture corpus, one dance at a time, motion as the oracle).
