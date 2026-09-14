# The figure primitive language: an expression calculus, not flat JSON

Date: 2026-09-14
Status: accepted

## Context

Vision D4 asks for three layers and one language: the dance record (already
data), the figure library as _definitions_ in a primitive language (data),
and that language executed by the engine. Today the dance record is data —
`Dance`, `FigureCall` and `chainCalls` all survive
`JSON.parse(JSON.stringify(...))` — but every one of the seventeen figures
in `packages/contra/src/figures/` is a TypeScript closure passed to
`contraFigure({ plan(ctx, params) })`. The middle layer does not exist.

The obvious first design is a flat record: a figure is a bag of numbers and
enum values, and the engine interpolates between named poses. **That design
cannot express a figure the library already ships.**

`ringHands` — the hand join every ring figure uses — is called as

```ts
ringHands(ctx, ring, (id) => placeAt(id, t), drop, stackPx);
```

Each joined hand is the midpoint of two dancers' shoulders at **the beat
being drawn**, computed from the other dancer's _currently-animating_
position, not from their start or end pose. `long-lines`' outward hand does
the same. A language with no cross-references between dancers, or one whose
only references are to fixed poses, has nothing to say here. So the language
needs at least one level of evaluation graph: "where station X is, in this
figure instance, at this beat."

That single requirement is what this ADR decides, and it is worth stating
plainly because it is the one place the design chose machinery over
simplicity.

## Decision

### A small closed expression calculus

Three mutually recursive expression families, plus one for naming a dancer.
Every node is a plain object with a discriminating key and no functions in
it, so a whole figure spec round-trips through JSON exactly as a `Dance`
does.

```ts
type NumberExpr = number | { param } | { number: "select" } | { number: "mul" };
type AngleExpr = number | { param } | { angle: "bearing" } | { angle: "facingOf" };
type StationExpr = StationId | { station: "self" } | { station: "ringShift"; places };
type PointExpr =
  | { point: "start" | "end" | "live"; station }
  | { point: "ringCentre" }
  | { point: "midpoint" }
  | { point: "polar" }
  | { point: "offset" }
  | { point: "joinPoint"; a; aSide; b; bSide };
```

`{ point: "live", station }` is the node the whole design exists for.
`{ point: "joinPoint" }` reads both of its dancers live for the same reason:
a joined hand is by definition the shared floor point of two moving bodies.

`StationExpr` is an addition to the shape the roadmap plan sketched, where
every reference was a literal `StationId`. A ring figure's hand track has to
say "the dancer one place round" — the same sentence for all four dancers —
or the spec has to be written out four times with the stations hard-coded,
which stops being one figure and starts being one figure per formation.

### A short list of motion segments and one hand primitive

A figure's `tracks` map role classes to segments and its `hands` map the
same keys to a pair of hand specs. Keys resolve most-particular-first:
a station id, then a role name, then `"all"`.

`ringWalk` is the only segment this ADR lands (`walk`, `orbitPair` and
`oscillate` follow in later milestones). The hand primitive has three cases:
`"down"`, `"joined"`, and `"carried"` — the last reserved by the type, and
rejected by the compiler with a message naming the milestone that will
implement it, so widening a closed union is not later work.

Two shape changes from the roadmap plan's sketch, both forced by the code:

- **A segment carries its own `end` pose**, written as expressions, rather
  than the spec carrying a separate `ends` map or the compiler deriving the
  end facing from the segment's parameters. Deriving it would have meant
  asserting `bearing(p, centre) === bearing(centre, p) + 180`, which is not
  an identity in floating point; a figure's end facing is also genuinely its
  own choice (a circle faces the middle, a star faces across it).
- **A joined hand names both of its ends outright** (`a: {station, side}`,
  `b: {station, side}`) instead of the self-centric `{ with, mySide,
theirSide }` the plan sketched. The order decides nothing about the point
  — it is a midpoint — but it is what `joinsAt` reports, and naming it means
  the interpreter never guesses which way round a pair goes.

### The interpreter targets the contract that already exists

`compileFigureSpec(spec: FigureSpec): ContraFigure` _calls_ `contraFigure`.
It sits exactly where a coded figure's `contraFigure({ plan })` call sits and
produces the same `FigurePlan { at, ends, joinsAt }`. Nothing downstream
changes: not `FigureDef`, not `Group`, not the registry, not `chainCalls`,
not the decider, not `closureReport`/`reachReport`/`collisionReport`, not
the renderer. A compiled figure goes into `createContraRegistry`'s `extra`
array with no adapter — which is also the seam a dance-local figure and a
promoted one will use.

**Evaluation runs in passes**, because of the live cross-reference above:

1. **Ends** — each station's last segment says where the figure leaves them.
   Ends read start places and the ring; they never read a live position.
2. **Positions** — each station's track, evaluated at `t`, given the ends.
3. **Hands** — each hand spec at `t`, against the places pass 2 produced.

This is the same two steps `ringHands(ctx, ring, (id) => placeAt(id, t), …)`
already takes by closure capture, made explicit and figure-independent.
Reading `"end"` or `"live"` before its pass has run throws rather than
yielding a default, because that is a bug in a spec and not a missing value.

### Where it lives

`packages/contra/src/figures/language/`, and the specs in
`packages/contra/src/figures/specs/`.

The roadmap plan's preference was to split the form-neutral half into
`packages/choreo/src/figure/language/`. On contact with the code the split
is not free: the calculus's leaves are `ctx.spot` (a `PlanContext`, which is
contra's own type), `joinPoint`/`joinedHands` (contra's, and they read the
contra role set to decide whose hand stacks on top), and `ringShift`/
`ringFor` (contra's ring). Moving the calculus to `choreo` today means
moving or re-exporting all of that for a single consumer. The honest
sequencing is: move it when a second formation needs it, which is the
square fixture's job and not M1's.

### Coexistence, not migration

`circle.ts` stays exactly as it is, and `CONTRA_FIGURES` still holds it.
`circleSpec` compiles to `circle-data`, a separately-identified figure that
is deliberately not in the live registry. Its test is the proof — not a
migration.

## Consequences

- **Proven, not asserted.** `circle-data` gives the _identical_ `PoseSample`
  to coded `circle` at every 1/8 beat, for both formations and five
  parameter sets, plus identical `ends`, `moves`, joins and probe numbers;
  and both sequences dance to identical closure, reach and collision reports
  with the compiled figure swapped in through the registry. Equality is
  structural (`toEqual`), not a tolerance.
- **The interpreter is slower than a closure** — every sample rebuilds the
  ring and re-walks the tree — but so is every coded figure: `contraFigure`
  already re-plans per `sample` call, and `ringHands` already calls
  `placeAt` eight times per beat. No measurable change in the test suite.
- **A flat-JSON figure language is off the table** for this codebase, and
  the reason is a figure in production use rather than a hypothetical.
- **`hey`, `swing` and `robins-chain` stay code.** A closed racetrack lane
  and a velocity-sampled buzz-step foot placement are each machinery for
  exactly one figure; `swing` is additionally under an explicit
  do-not-touch ruling (DD21), and `hey` and `robins-chain` are both known to
  need choreography fixes before their representation is worth settling.
  Revisit only if a second figure ever needs the same novel primitive.
- **M1 compiles exactly one segment per track.** Sequencing segments within
  a track is M2's; the data shape (`readonly Segment[]`) is already right
  for it, and the compiler says so by name when it sees two.

## Alternatives considered

- **Flat JSON with no cross-references.** Rejected: cannot express
  `ringHands`. This is the ADR's central claim.
- **A general small interpreter** (arbitrary arithmetic, user-defined
  helpers, a real evaluator with scopes). Rejected for now: more
  implementation risk than the problem has shown, and a closed union is what
  makes a spec checkable and a missing case a compile error.
- **Retiring `circle.ts` in favour of the compiled figure.** Rejected:
  coexistence is the roadmap's default; retiring thirteen coded figures is
  real work with its own byte-identical proof obligation each, and it is not
  what proving the language requires.
