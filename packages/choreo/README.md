# @caller/choreo

Form-neutral choreography model and the decider: `Formation`, `Group`,
`FigureDef`, `Progression`, `Dance`, `Program`, `Utterance`, and the
`Timeline` of `FigureInstance` and `Utterance` events produced by a decider.
Lark and robin are role names defined by a role set (e.g. the contra role
set in `@caller/contra`), not concepts this package knows about.

## Allowed imports

`@caller/choreo` may import `@caller/core`. Nothing else in this workspace.

It re-exports the slice of `@caller/core` a formation or figure needs —
`Vec2`, `Angle`, `Beat`, `PoseSample`, `Hand`, the rendering-contract
constants, and the geometry helpers — so that `@caller/contra` can stay on
its one allowed edge (`contra → choreo`) and still speak the same geometry
as the renderer.

## The five layers, and where the seam is

```text
core        time and kinematics                  (M2)
  ↑
choreo      formations, groups, figures,         ← this package
            dances, programs, the decider
  ↑
contra      one form: roles, formations,         (@caller/contra)
            the figure library, the dances
```

Everything above the timeline — `@caller/hall`, `apps/web` — reads
`TimelineEvent`s and `poseAt`. Nothing above it calls a figure directly.
See [the ADR](../../docs/adr/2026-09-13-choreography-model-and-decider-seam.md).

## The contract

### Formations and groups — `src/formation/`, `src/group/`

```ts
interface RoleSet {
  roles: readonly string[];
  top: string;
}
interface Station {
  id: StationId;
  p: Vec2;
  facing: Angle;
  role: RoleName;
}
interface Frame {
  centre: Vec2;
  axis: Angle;
  spacing: number;
}
interface Group {
  id;
  frame: Frame;
  members: Record<StationId, DancerId>;
  stations: readonly Station[];
  roleSet: RoleSet;
}
interface CoupleState {
  id;
  dancers: Record<RoleName, DancerId>;
  place: number;
  direction: 1 | -1;
}
interface SetState {
  id;
  frame: Frame;
  pitch: number;
  couples: readonly CoupleState[];
}
interface HallState {
  sets: readonly SetState[];
}
interface Progression {
  next(set: SetState): SetState;
}
type GroupSelector = "hands-four" | string;
type GroupKind = "set" | "wait-top" | "wait-bottom";
interface GroupPlan {
  id: GroupId;
  kind: GroupKind;
  frame: Frame;
  stations: readonly Station[];
  members: Record<StationId, DancerId>;
  couples: readonly CoupleId[];
}
interface Formation {
  id;
  roleSet: RoleSet;
  lineUpCalls?: readonly string[];
  handsFourCalls?: (shift: LineUpShift) => readonly string[];
  walkthroughOpening?: (shift: LineUpShift) => { line: string; hint?: string };
  group(n: number): Station[];
  groupFor(selector: GroupSelector): Station[];
  progression: Progression;
  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[];
  start(spec: SetSpec): SetState;
  tags(selector: GroupSelector): Record<string, StationId[]>;
}
```

**What the caller says is the form's business** (M13). The script decider takes
an optional `callsFor(dance, timeThrough)` and says whatever list of
`{ offset, text, beats? }` events it hands back, `offset` being the beat of the
time through the utterance is said before and the lead applied to it exactly as
it is to a call's own start. Left out, the decider does what it always did: one
utterance per written call, the dance's own words or the figure's. `@caller/contra`
supplies one that shortens a call as the hall learns the dance and says two short
figures in one breath; none of that arithmetic is here, and none of it could be —
the hook carries beats and text and never a relation or a figure-role.

**A formation supplies its own words**, heard and read. `lineUpCalls` and
`handsFourCalls` are what the caller says to get a hall standing in it (a
becket hall hears a third sentence after it has hands); `walkthroughOpening` is
the sentence a **walkthrough card** opens on, plus the app's own note under it.
The two are drawn from one vocabulary on purpose, so what a dancer reads and
what the hall hears are the same sentences.

**Groups are formed per figure call, by a selector.** `groupsFor` is asked
once for every call in a dance, not once per time through, and a call says
which partition it runs in through `FigureCall.group` (default
`"hands-four"`, the ordinary minor set). `choreo` supplies the mechanism and
that one meaning; each formation supplies the rest, and throws for a
selector it does not define rather than quietly dancing in fours. A call
that reaches past its own four — a shadow allemande, a diagonal chain, long
lines that sweep the couple standing out — is a different selector, not a
different figure. `groupFor` is the same thing at authoring time, before any
hall exists: the abstract station layout `@caller/contra`'s `chainCalls`
threads a dance's places through.

**`groupsFor` must return a partition**: every dancer in the set in exactly
one group, dancing and standing out alike. That is what makes it impossible
for two groups of one call to claim the same dancer — `Timeline.add()`
throws when a dancer is bound into two figures over overlapping beats, so a
partition that is not one fails loudly. `src/testing/assertPartition.ts`
(`partitionProblems`, `assertPartition`) checks the property directly
against a formation, before any dance is written on it.

**There are two outs.** A couple with nobody to dance with is `wait-top` or
`wait-bottom`, never a bare "wait": the top out is the couple hands four is
reckoned from and the one long lines addresses, the bottom out is the one a
"down the hall" sweeps along and the one a becket line's shift pushes off
the end. Each formation already has the signal that tells them apart — it is
what turns a waiting couple's frame end for end — so `kind` surfaces it
rather than making every later reader derive it again.

**`tags` is keyed by selector, not by station count.** Two partitions can
hand out groups of the same size, so `n` does not say what a tag means.
`resolveSelector(who, formation, groupSelector, stations)` filters the tag's
station list down to the ids the call's own group has, which is what lets
one abstract definition serve a selector's widest shape and its narrowest.

**Frame-local coordinates.** A station's `p` and `facing` are in the group
frame's own axes, in world px: **local +y runs along `frame.axis`** (down
the hall for a contra set) and **local +x is 90° to the left of it** (across
the set). `framePoint` and `frameAngle` map them to the world;
`reverseFrame` turns a frame end for end, which is how one wait-out layout
serves both ends of a line. `frame.spacing` is how far apart two dancers
stand to join hands (the contract's 14 px), not a scale on `p`.

**A station's `role` is who starts there**, not a claim about who stands
there later: a duple-improper one-lark ends the dance on the two-robin's
station, which is exactly what progressing means.

### Figures — `src/figure/`

```ts
interface FigureParams {
  beats: Beat;
}
interface FigureDef<P extends FigureParams> {
  id;
  call: string;
  lead: Beat;
  beats: Beat;
  defaults: Omit<P, "beats">;
  sample(group: Group, station: StationId, t: Beat, params: P): PoseSample; // pure
  ends(group: Group, params: P): Record<StationId, EndPose>;
}
```

`sample` is pure: same inputs, same pose. Everything it needs comes from
`group` and `params`, so the decider can sample it out of order and the
renderer per frame. Tuning values are parameters, which is what makes a
flourish data rather than a variant figure.

Four built-in figures live here, because the decider itself needs them:

| Figure            | What it does                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `wait-out`        | The couple with nobody to dance with steps together, holds hands, lets go, and crosses over during the last eight beats          |
| `walk-to-station` | Everyone walks from one station to another, or stands; also the "who is left out" stand and the between-dance line-up            |
| `thanks`          | The hall stops where it is, turns and nods to its partner, then to its neighbour across — no clapping, at the end of every dance |
| `take-hands`      | Hands four: the group steps into a ring, joins hands round it, moves `places` round, and lets go on to its own places            |

The contra figure library is M8's; these four are the engine's own.

### The ring — `src/figure/ring.ts`

The regular ring a group makes when it takes hands round: `n` places evenly
spaced, the radius that puts neighbours `RING_NEIGHBOR_SPACING_PX` apart — two
arms, each extended to `RING_ARM_EXTENSION` (0.8) of their reach, not the
couple spacing — so every arm reaches without cramming elbows out straight
(F11), clamped to the group's own narrower half-extent (across or along)
plus a small margin so a ring that turns never sweeps into a neighbouring
group's space (AC6), and its phase turned to where the dancers already stand.
`ringOf`, `ringOrder`, `ringShift`, `ringWalk` and `ringHands` are all here and
`@caller/contra`'s `figures/ring.ts` re-exports every one of them — `circle`,
`star`, `petronella`, `balance` and the figure-spec language read them from
there. The geometry lives at this layer because the decider's own `take-hands`
needs it and may not import a form.

`ringOrder` runs **anticlockwise on the floor**: with y increasing downward, a
dancer facing the ring's centre moves to their own left as their angle about
the centre increases. That is the direction `ringShift(ring, id, +1)` goes, and
the direction a circle left travels.

### The line-up shift — `src/formation/lineUpShift.ts`

Whether a formation's hall moves after it has taken hands four, and which way.
Derived, never declared: ask the formation's own `progression.next` where one
time through leaves a dancer, and measure that against the way the dancer was
facing. Travel **along** the facing is no shift; travel **across** it is a
shift, to whichever side the travel is on. That is the whole of what makes a
becket dance becket — you progress sideways — and it means a becket whose lines
slide the other way answers `"right"` with nothing written down.

### Dances and programs — `src/dance/`

`Dance` and `Program` are data with no functions in them, so they survive
`JSON.parse(JSON.stringify(dance))` and ship as files. A dance's length
comes from its own figure calls (`danceBeats`), never from a meter
constant; `validateDance` insists every phrase is the same length. A figure
may end anywhere inside a phrase — a 4-beat balance and a 12-beat swing is a
normal A1.

A dance may also carry **`startPlaces`**: where each station's dancer stands
at beat 0 of every time through, in the group frame's own axes. Left out —
the usual case — it is the formation's stations. It exists for a dance whose
_first figure is the progression_: a becket dance that shifts left in its
first two beats dances the rest of the time through with the couple it
shifted to, so the minor set a time through runs in is the one the shift
makes and everybody begins one couple place back along their own line.
Closure (AC5) is then measured against these places in the progressed set
rather than against the stations. Two things read it: the line-up walk
between two dances walks people here instead of to the stations, and a waiting couple's
`wait-out` reckons its crossing from here — it slid off the end of the line
with everybody else and has to land one place short of the waiting place,
ready to slide in again. The dance's own figures are told where they start by
their own parameters, which is what `@caller/contra`'s `chainCalls` threads.

### The seam — `src/timeline/`

```ts
type TimelineEvent =
  | {
      kind: "figure";
      group: GroupId;
      figure: string;
      params: object;
      bindings: Record<StationId, DancerId>;
      start: Beat;
      end: Beat;
    }
  | {
      kind: "utterance";
      speaker: "caller" | { dancer: DancerId };
      text: string;
      start: Beat;
      end: Beat;
    };
function poseAt(timeline: Timeline, dancer: DancerId, beat: Beat): PoseSample;
```

`poseAt` finds the figure instance that owns the beat, samples it, and eases
it out of the previous instance with `@caller/core`'s `easeSeam` and
`seamProgress` over the first `SEAM_BEATS`. Hands, facing and lean
cross-fade; position comes from the figure that is running, which is why
closure has to hold to 0.01 px — nothing here hides a gap.

### The decider — `src/decider/`

```ts
interface Decider {
  advance(until: Beat): TimelineEvent[];
  timeline(): Timeline;
  covered(): Beat;
}
function createScriptDecider(program, registry, hall, library, options?): Decider;
```

The script decider dances the program as written. Every time through it
asks the formation, **call by call**, how the whole set divides up for that
call (`groupsFor`), plays the figure into each group that dances it, says
each call `lead` beats early and two beats into the figure, and asks the
progression what the set looks like next. Whatever beats of a time through
nobody claimed for a couple standing out are then filled with `wait-out` —
there is no waiting-couple special case, only a group nothing selected.
With `"hands-four"` the only selector any call names, nothing ever claims a
couple standing out and the fill is the whole cycle, exactly as it was when
the special case existed. After a dance's `timesThrough` it announces the next dance
over the last eight beats, walks everybody to the next dance's own first
places (its `startPlaces`, or the stations) over an eight-beat gap, calls
hands four from the top, and carries on; the program loops, so the demo
cycles with nobody touching it.

**The waiting-couple sweep (M2).** A call whose selector reaches a waiting
couple's stations — `@caller/contra`'s `"line"`, widened at a true end —
claims them for its own span exactly like a dancing couple; every beat of the
cycle nothing claims is still filled with `wait-out`, but now possibly in
more than one piece (a leading gap, a trailing one, both scoped to their own
`beats`). `WaitOutParams` gains `join`/`cross` booleans, both defaulting
`true`, so a gap can say which of its two ramps actually apply: `join` (the
step-together-and-take-hands ramp) only makes sense for a gap that opens at
the couple's own beat 0 — anything later means an earlier call already had
them — and `cross` (the walk to the far station) only for a gap that runs to
the cycle's own boundary — anything earlier means a later call is going to
sweep them out before the crossing matters. The part-out ramp (hold → home)
always runs regardless of `cross`, landing the couple back at its own station
by the end of every gap, which is what lets the _next_ sweep or gap pick them
up with no seam to paper over. `createScriptDecider` computes both flags per
gap (`join: from === 0`, `cross: to === cycle`) and, because a leading gap
discovered only after a later sweep's claims are known must still reach
`Timeline.add()` before that sweep's own event, defers every figure emission
for a cycle and runs them in beat order at the end — stably, so a schedule
with no sweep (every dance before M2, and any waiting couple no call actually
reaches) keeps sorting its untouched wait-out fill after every ordinary call,
exactly as it always has.

A call's own `ends: "both" | "top" | "bottom"` field (default `"both"`) says
which true end(s) it is willing to sweep into — `groupsFor` itself always
computes the widest partition it can, regardless of `ends`; the decider's
`excludedByEnds` reads two well-known tag names, `"wait-top"`/`"wait-bottom"`
(the same vocabulary `GroupPlan.kind`'s own two outs already use), and drops
whichever of them a call's `ends` does not permit from that call's own
`selected`/`claimed` set — never merely standing those dancers through the
call, which would still claim their beats and rob the untouched end of its
single, whole-cycle `wait-out`.

**The cycle planner seam (M1 of the figure model).** How one time through
becomes figures is now injectable: `ScriptDeciderOptions.cycle?: CyclePlanner`
takes a pure function from a `CycleInput` — the dance, the formation, the
registry, the hall as it stands, the beat the time through starts on, whether
it is the first, where the last figure left every dancer, and a `mintGroup`
that registers a group on the timeline — to the cycle's `CycleEmission`s, in
the order they are to be added, plus the hall as it stands afterwards. Left
out, it is `defaultCyclePlanner`, which is the two-pass emission half of
`emitCycle` exactly as described above, lifted out whole. Everything else
stays the decider's: `emitFigure`, `standingAt`, the utterances, and the whole
between-dances interval. Nothing in the seam is form-specific — a planner that
wants relations, slots or a lattice brings them itself, which is how
`@caller/contra`'s own set-state layer reaches the decider without this
package learning a word of contra. `square.test.ts` runs on the default, which
is what proves the extraction changed nothing.

## Form neutrality, and how it is enforced

`src/testing/square.ts` is a square formation — four couples on the sides of
a square, groups of eight, no progression, no ones and twos — and
`square.test.ts` writes "heads forward and back" against the same
`FigureDef`, runs it through the same decider and the same `poseAt`, and
puts it through the same oracles. If this package ever grows a contra
assumption, that is what catches it.

It also seats **five or six** couples on purpose, standing the extras out
beyond the ends of the set's own axis — a square has no such thing, which is
the point. That is what proves the partition property at an odd set size and
puts both `wait-top` and `wait-bottom` on the floor, in a fixture that knows
nothing about lines, ones and twos, or contra at all.

## The oracles — `src/testing/oracles.ts`

These are how the plan's acceptance criteria are checked, and they run over
a timeline, so they serve every dance anyone encodes:

| Function           | Criterion | Number                                                               |
| ------------------ | --------- | -------------------------------------------------------------------- |
| `closureReport`    | AC5       | Every figure seam under 0.01 px, including the end of a time through |
| `reachReport`      | AC1       | `short === 0` for every placed hand at every 1/8 beat                |
| `collisionReport`  | AC6       | No two torso centres within 8 px at any 1/8 beat                     |
| `coverageProblems` | —         | Every dancer has exactly one figure at every beat                    |
| `motionReport`     | —         | How the drawn arm moves; see below                                   |

`src/testing/assertPartition.ts` sits beside them and asks the same kind of
question one step earlier, of a formation rather than of a danced timeline:
`partitionProblems(plans, set)` returns every dancer in two groups, in none,
or in a group but not in the set, and `assertPartition` throws with the lot.

### `motionReport` — the motion oracle

The three above ask whether the model is self-consistent. Every dance in the
library passes all three while still looking wrong, so `motionReport` asks a
different question: **does what is drawn move continuously?**

It samples every dancer at 1/32 beat, resolves the arm the renderer actually
draws through `@caller/core`'s `drawnArms` — the elbow is what reads as a jump,
even when the hand barely moves — and attributes every number to a figure
instance and, for the first `SEAM_BEATS` of one, to the `prev → next` seam that
led into it. Per figure and per seam it reports the worst hand floor speed, the
worst elbow floor speed, the worst height rate, how many times a hand flipped
between placed and hanging, how many samples were **not a finite number**, and
the worst out-and-back inside one beat, each with the dancer, beat and hand
that produced it. `formatMotionReport` renders it as markdown.

The non-finite count exists because `NaN > max` is false: a hand that is not a
number slides through every maximum in every other oracle silently, and an arm
that is not a number is drawn as nothing at all. It is the one failure the rest
of this file is blind to, so it gets its own column and sorts above everything.

`motionReport` takes its bounds from the caller and never judges. `@caller/contra`'s
`motionBounds.ts` derives the contra library's own.

## Trajectory assertions — `src/testing/trajectory.ts`

Form-neutral assertions about what a figure's dancers actually _did_, over a
`Track` of sampled poses and declared hand joins: `passes` (two dancers come
close, near a named point, moving oppositely, with one on the other's named
shoulder), `walksBackward`, `handsJoined`, `handsStill` (relative to the body),
`staysOnPlace`, `endsOn`, and `joinWindow` (the span a figure itself declares a
join, so a check never invents a window). Every one returns a result with a
pass flag and the worst evidence, and none of them throws — a report prints
them all, and a test asserts over the list. A figure can be perfectly closed,
perfectly in reach and completely wrong; this is the class of bug they catch.

## Traces — `src/trace/sampleTrace.ts`

`sampleTrace(timeline, { to, from, dancers, step, frame })` walks a window of a
timeline with `poseAt` — the same call the renderer makes every frame — and
writes down where every dancer's feet went, eight samples to the beat, tagged
with the figure instance that owns each sample. It is pure data: no colours, no
pixels. `@caller/hall`'s `src/traces/` draws it four ways (pen plot, march,
seismograph, figure strip), and `apps/web`'s `pnpm traces:export` writes every
figure's and every dance's four views to `apps/web/e2e/traces/`.

Two decisions worth knowing:

- **Positions come back in one fixed frame**, not in whichever group frame owns
  a sample. A contra set mints a fresh group every time through and a becket set
  re-centres after its slide, so re-framing per sample would break the ink
  exactly where the dancers are still walking. One frame means the progression
  draws as the travel it is. `x` is across the set, `y` along it.
- **`spans` are truthful and `cells` are readable.** Every figure event any
  traced dancer dances is a span; a call with a `who` therefore has two (the
  figure and the `walk-to-station` covering everybody else). The strip wants one
  cell per call, so `cells` collapses the spans that share a window to the one
  most of the group danced, with a filler figure never beating a real one.

Form-neutral, like the rest of the package: a pen's `rank` is read from the
leading digits of its station id (contra's `"1L"` is rank 1), overridable, and a
cell's `family` is whatever `familyOf` says — by default the figure id, because
the workspace has no move-family taxonomy yet.

## Deviations from the hall spike

Production code never imports from `spikes/`; the line and progression
behaviour was read from `spikes/hall/index.html` and retyped.

- **The lines are 32 px apart, the spike's are 24.** `AGENTS.md` AC3 says
  the two lines are 18 px further apart than a pair's 14 px hold spacing;
  the spike's `AX = 12` predates that number.
- **Progression is geometrically exact.** The spike jumps a couple 20 px at
  the cycle boundary because its minor sets sit on a fixed 40 px grid and
  its dance ends in the same set it started in. Here places along a line are
  20 px apart, hands four takes the next pair down from the top, and a time
  through moves the ones to the place below and the twos to the place above
  — which closes to machine epsilon.
- **A waiting couple steps together before taking hands, and steps back out
  before crossing.** The spike holds hands at the stations, a line's width
  apart, which no 15 px arm reaches (AC1), and crossing from the closed-up
  hold takes the two within 8 px of each other (AC6).
