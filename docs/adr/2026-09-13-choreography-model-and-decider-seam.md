# The choreography model and the decider seam

Date: 2026-09-13
Status: accepted

**Superseded in part by
[2026-09-15-figure-model-set-state-and-resolution.md](./2026-09-15-figure-model-set-state-and-resolution.md).**
What stands: the four layers, the decider seam, the timeline, the oracles and
the rendering contract. What does not: this ADR froze `Frame` and `FigureDef`
to protect a figure library written as seventeen TypeScript closures, and that
library was rebuilt as data and then deleted (M11, 2026-09-16/17, on the user's
ruling). A contra figure is a `FigureDefinition` read by an interpreter now,
and `@caller/choreo`'s script decider takes an optional, form-neutral
`CyclePlanner` that the contra planner supplies.

## Context

The simulator has to do four things that pull in different directions. It
has to draw dancers, which needs geometry per frame. It has to dance real
contras, which needs a figure library somebody can read and edit. It has to
prove it is not cheating — hands that meet, dancers that do not walk through
each other, a dance that closes — which needs the geometry to be checkable
without rendering anything. And it has to be able to grow actor deciders
later (vision D9, D15, D22), where dancers make offers and answer them,
without rewriting the figures underneath.

The two spikes were canned keyframes for one 64-beat dance: a table of poses
per role per eighth-beat, with the progression faked by jumping each couple
onto the next minor set of a fixed grid. That is the right shape for a
spike and the wrong shape for anything that has to close to 0.01 px or host
a second formation.

## Decision

**Five layers, each a package boundary**, as `plan.md` D4 settled:

```text
core        time and kinematics; knows nothing about dancing
  ↑
choreo      formations, groups, figures, dances, programs, the decider
  ↑
contra      one form: the role set, the formations, the figures, the dances
```

with `hall`, `music` and `apps/web` reading the timeline and pose samples
and never calling a figure directly.

### The timeline is the seam

A decider produces `TimelineEvent`s — `{ kind: "figure", group, figure,
params, bindings, start, end }` and `{ kind: "utterance", speaker, text,
start, end }` — ahead of the play head, and `poseAt(timeline, dancer, beat)`
is the only thing anything above asks for. Everything about _why_ a dancer
is where they are lives below the seam; everything about _drawing_ lives
above it.

This is what makes the later actor deciders (M14) additive rather than a
rewrite: a different decider fills the same timeline. It is also what makes
a mid-tune dance switch a non-feature — the decider simply schedules
different figures after a phrase boundary, and no layer above notices.

### Figures are pure functions over a group frame

```ts
sample(group: Group, station: StationId, t: Beat, params: P): PoseSample
ends(group: Group, params: P): Record<StationId, EndPose>
```

A `Group` is a `Frame` — a centre, an axis and the hold spacing — plus the
station layout, the bindings of dancers to stations, and the role set. A
figure gets nothing else. It cannot read a clock, cannot remember the last
call, and cannot see the hall.

Purity is what the oracles rest on. Closure is checked by comparing one
figure's `ends` against the next figure's `sample` at `t = 0` — if `sample`
could drift, the check would be meaningless. Collisions and reach are
checked by sampling every dancer at every 1/8 beat in any order.

A figure that genuinely needs to know where a dancer came from takes it as a
parameter: `walk-to-station`'s `origins` is how the decider walks everybody
from the end of one dance to the start of the next without giving figures
memory.

### Flourishes are parameters

Tuning values are figure parameters, not constants and not new figures (the
swing's hand offset, the allemande's inward turn, `wait-out`'s hold drop and
bow). A `FigureCall` in a dance carries `params`, `who` and an optional
`call` override, all data, so a dance file can shade a figure without a code
change, and M11's data-driven library has somewhere to land.

The call's duration is injected into `params.beats`, because a `FigureCall`
may stretch a figure and `sample` only receives `t`.

### Dances and programs are data

No functions anywhere in a `Dance` or a `Program`; both survive
`JSON.parse(JSON.stringify(...))`. A dance's length comes from its own
figure calls, never from a meter constant, and every phrase must be the same
length; a figure may end anywhere inside a phrase.

### Form neutrality, and the fixture that enforces it

`@caller/choreo` never names a role. A `RoleSet` carries the role names and
which role's hand stacks on top; `@caller/core`'s `stackJoined` reads only
`top`. Station subsets a `Selector` names (`larks`, `ones`, `heads`) are
resolved by asking the _formation_ for its own tags, so a tag one formation
does not define is an error rather than an empty selection.

The enforcement is a test, not a rule: `src/testing/square.ts` is a square
— four couples on the sides of a square, groups of eight, no ones and twos,
no progression — and its test writes "heads forward and back" against the
same `FigureDef`, schedules it with the same decider, samples it with the
same `poseAt`, and runs the same closure, reach and collision oracles over
it. A contra assumption anywhere in `choreo` breaks that test.

## Consequences

- **The progression is geometrically honest, so AC5 is a real check.**
  Places along a line are 20 px apart, hands four takes the next pair down
  from the top, and one time through moves the ones one place down and the
  twos one place up. The fixture dance closes to about 4 × 10⁻¹⁵ px at every
  line length from 2 to 6, which is floating-point noise rather than a
  tolerance being met.
- **`Frame` and `FigureDef` are frozen early.** M5's pair figures and M8's
  contra library are written against them, so changing either is a reversal.
- **`Group` carries more than the plan's sketch.** It has `stations` and
  `roleSet` as well as `frame` and `members`, because `sample(group,
station, …)` cannot resolve a station's place or stack a joined hand
  without them.
- **A formation does more than the plan's sketch.** As well as `group(n)`
  and `progression` it has `groups(set)`, `start(spec)` and `tags(n)`:
  partitioning a set into groups, seating a hall, and naming station subsets
  are all formation-specific, and putting them anywhere else would have put
  contra knowledge in `choreo`.
- **A placeholder figure can only express progressions that stay inside a
  group frame.** Duple improper's does; becket's does not, because a becket
  couple slides to a _different_ group. Becket's model is implemented and
  tested here, but the closure fixture over a real becket dance waits for
  M8's figures.
- **The waiting couple is not the spike's.** It steps together to the
  14 px hold spacing before taking hands (no 15 px arm reaches across a
  32 px line, AC1) and steps back out before crossing (crossing from the
  closed-up hold takes the two within 8 px, AC6). The crossing itself is the
  spike's station-to-station move over the last eight beats.

## Amendment, 2026-09-14 (M10 cleanup): reconciled against the merges since

This ADR's five layers, timeline-as-seam, pure-figure contract and form-neutral
fixture are all still exactly true — nothing below is a reversal of the
Decision above. Five things merged after this ADR was written extend it in
ways worth recording here rather than leaving only in milestone reports:

- **`Dance` carries two more, optional, still-data fields**:
  `startPlaces?: Record<StationId, EndPose>` (where every station's dancer
  stands at beat 0 of _every_ time through, when it differs from the
  formation's own stations — a becket dance whose first figure is the
  progression needs this) and `waitOut?: object` (parameters for the `wait-out`
  a waiting couple is given, for a dance whose progression is fast enough that
  the figure's own defaults would put two couples inside AC6's 8 px). Both are
  read by `packages/choreo/src/decider/createScriptDecider.ts`; the "no
  functions, survives `JSON.parse(JSON.stringify(...))`" rule this ADR states
  for `Dance` is unchanged by either — see `Dance.ts`'s own doc comments for
  each field's full reasoning, and `docs/adr/2026-09-14-dances-as-files.md` for
  why a dance can carry them as plain JSON.
- **Becket's odd-couple handling** (an odd becket set holds a second waiting
  place beyond the bottom) is implemented in `packages/contra/src/formation/becket.ts`
  and exercised by its own fixtures; it is a consequence of the "waiting couple
  is not the spike's" point above, worked out concretely once a real becket
  dance (not just the fixture) needed it.
- **`SetState` gained a `spec`** (S1): the set's own seating record — which
  physical dancer sits where before the first dance starts — so the hall can
  seat couples once, deterministically, and every dance after the first reads
  its start positions off the set rather than off each formation's default
  layout. This does not change anything the Decision section says about a
  `Group` or a `Frame`; it is what feeds `startPlaces` above from the hall's
  own side of the seam.
- **The decider grew a between-dances interval** (`lineUpCalls`, B1): the
  eight-beat line-up between two dances is no longer a silent walk to the next
  formation — `Decider`'s program contract now carries `lineUpCalls` (what the
  caller says while everybody gets into position, per `Formation.lineUpCalls`),
  `applauseCalls` and a `readyCall`, all threaded through the same
  `TimelineEvent`-producing seam this ADR already describes. Nothing above the
  timeline seam had to change to host it.
- **A figure's held hands can now survive a figure boundary without being let
  go and retaken** (`carried`, F3c): `FigureDef`'s params gain a `carried`
  field alongside `from`, threaded by `chainCalls` exactly the way `from`
  always was — a figure that inherits a `carried` hand skips its own take
  animation for that hand and a figure that hands one off skips its own
  release. This is additive to "flourishes are parameters" above, not a
  change to it.
- **Groups are now formed per figure call, not once per time through**
  (`groupsFor`, `tags(selector)`, `groupFor`, cross-set M1 and M2): this is a
  large enough change to `Formation`'s own contract that it has its own ADR,
  `docs/adr/2026-09-14-per-call-group-selection.md`, which supersedes this
  ADR's line "As well as `group(n)` and `progression` it has `groups(set)`,
  `start(spec)` and `tags(n)`" specifically — read that ADR for the current
  contract. Everything else this ADR says about a `Formation`'s role in the
  five-layer model (contra knowledge stays out of `choreo`, a formation
  answers structural questions about itself) still holds.

None of the above needed a superseding ADR of its own — each is additive to a
contract this ADR already describes, and the two big enough to need their own
explanation (`groupsFor`, and the JSON dance-file format) already have one.

## Alternatives considered

- **Keeping the spikes' keyframe tables.** Rejected: a table cannot close to
  0.01 px across line lengths, cannot host a square, and gives a renderer no
  way to know what a dancer is doing.
- **Letting figures read the previous pose.** Rejected: it would make
  `sample` impure, break out-of-order sampling, and make the closure oracle
  circular. `origins` as data does the same job without the cost.
- **Scaling station coordinates by `frame.spacing`.** The plan's sketch says
  stations are "in group-frame units", which could mean units of the hold
  spacing. Rejected: the AC3 line offset makes the across distance 32 px,
  which is 2.285… hold spacings — a unit nobody would write by hand.
  Stations are frame-local px instead, and `spacing` is what figures use to
  place joined hands.
