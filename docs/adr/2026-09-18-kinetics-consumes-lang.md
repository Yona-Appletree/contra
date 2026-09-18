# Engine 3 consumes the dance language's timeline

Date: 2026-09-18
Status: accepted

## Context

There were two grammars in the repository. Round 1 of engine 3's language
(PR #103's `$`-sigil text, `packages/kinetics/src/lang/`) drove the kinetics
stack — a formation evaluated to a tree, a dance compiled per dancer, calls
handed to the scheduler. Round 2 (PR #104, a draft on
`claude/dance-language-2`) was a rewrite of the same idea. Draft 3
(`packages/lang`, PR #105) then shipped as its own package: groups first
class, patterns everywhere, a checker, a two-pass evaluator producing an
evening of per-beat commits, a CLI and a playground — and, by
`scripts/check-deps.mjs`, importing nothing and imported by nothing.

[The groups-first-class ADR](./2026-09-17-dance-language-groups-first-class.md)
left the join open in as many words: _"`packages/kinetics`'s own kinematics
and executor work is untouched and keeps running on the old text until a
later round joins the two stacks."_ This is that round. The user, 2026-09-17
late: _"ship it, then overnight work on using it in the previous engine 3
work."_

Two grammars is the confusion the user pulled out of, and the kinematics
layers below the compiled sequence — the scheduler, the executor, the body
solver, the proof — never touched a grammar at all. The question was only
which text a dance has.

## Decision

**`packages/kinetics` consumes `@caller/lang`'s evening, and round 1's
language, tree and `.dance` files are deleted.**

- **The adapter is the seam.** `src/sequence/fromLang.ts` takes an
  `EveningResult` and a figure registry and gives back the `CompiledSequence`
  and `Dialect` the scheduler already took. It reads five things and nothing
  else: the dancers, the seating after every commit, each dancer's moves in
  order, what each move's arguments point at, and where the move was written.
  Nothing below it knows there is a language.
- **`lang` stays import-free.** The dependency line is `core, hall, lang ←
kinetics`; `@caller/lang` imports no workspace package, and the two small
  additions the join needed are additions to its own timeline, not to its
  dependencies: `MoveArg.ref` (the person or the node an argument names,
  beside the text of it) and `Move.span` (the call in the text).
- **One home for `.dance` text**: `packages/lang/dances/`. Round 1's
  `packages/kinetics/dances/` is gone, and the pair fixture the vertical
  stack was built on is `pair.dance` beside the rest.
- **An `ir` the registry lacks is a diagnostic and a stand**, never a silent
  one: a `K001` at the move's span naming the move and its beats, and a
  private one-window `standing` figure for those beats. Butter's chain and
  hey are two such diagnostics until M2. A figure that wants a dancer or a
  ring the move never names is the same thing said about the cast (`K002`,
  `K004`).
- **`pnpm kinetics check <dance>`** runs the whole stack headless and prints
  every layer's complaints in one shape — the language's own, rustc's — with
  the `.dance` line and a caret wherever a span survived the journey down.
  It exits non-zero on any error, so CI, an agent and a person read the same
  answer.
- **Figures are still TypeScript IR.** A move is still `ir "swing"`, a name
  the kinematics reads; putting a move's body in the language is M7 of the
  kinetics-on-lang plan and needs its own vision session.

### The mirror, which is the part that was not obvious

The two packages had **opposite handedness**, and nothing without motion
could see it. `@caller/lang` says a node's own `+x` is to its right
(`eval/frame.ts`); the engine says a dancer's right is `facing + 90°`
(`dialect/Dialect.ts`). Mapping a frame straight through — position across,
facing through the unit vector — therefore reflects every dancer without
moving one: "shift **left**" walked the becket's ones up the hall while the
progression sent them down, and the lark stood on the wrong side of the
robin. `dialect/langDialect.ts`'s `posePx` mirrors `x`, which keeps the hall's
top at the top and makes left left; `.dance` text needed no change at all.

## Consequences

- **The debugger reads the language's tree.** Its source pane picks among the
  files a dance reads and lights the call in the one it was written in; its
  tree, layout and timeline panes are over `evening.tree` and the evening's
  snapshots; it bundles `packages/lang/dances/` with `import.meta.glob` and
  parses nothing. The lang playground (:5178) stays: it is the language's own
  tool, with no motion in it. Folding the two into one is future work.
- **PR #104 is closed as superseded**, by this ADR and PR #105 before it. The
  branch stays in git.
- **Butter's pinned bounds moved, and the new numbers are written down** in
  `src/dances/butter.test.ts` with the old ones beside them. Two causes, both
  named there: the chain and the hey are stands until M2, and `becket.dance`
  lays its minor sets 1.6 m apart with every one of them seated, so a
  progression moves a couple twice as far as the shift has beats for. The
  second is a claim about the floor — the lattice a becket really has is half
  that pitch with alternate sets occupied — and it is G1's to rule on, so
  this round **diagnoses** it (`StepTooLong`, and a new drift check) rather
  than changing the fixture.
- **Drift is a check before it is a fix** (tool-building mode): a figure that
  ends further than a place from the seat the commit gave it names the
  figure, the beat, the dancer, the place and the distance
  (`src/schedule/drift.ts`). It is what caught the handedness above.
- **The 2026-09-17 ADRs' "keeps running on the old text" clause is closed**
  by this one.
