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
  group(n: number): Station[];
  groupFor(selector: GroupSelector): Station[];
  progression: Progression;
  groupsFor(selector: GroupSelector, set: SetState): GroupPlan[];
  start(spec: SetSpec): SetState;
  tags(selector: GroupSelector): Record<string, StationId[]>;
}
```

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

Three built-in figures live here, because the decider itself needs them:

| Figure            | What it does                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `wait-out`        | The couple with nobody to dance with steps together, holds hands, lets go, and crosses over during the last eight beats |
| `walk-to-station` | Everyone walks from one station to another, or stands; also the "who is left out" stand and the between-dance line-up   |
| `applaud`         | The hall stops where it is, turns to the band and claps — the applause at the end of every dance                        |

The contra figure library is M8's; these two are the engine's own.

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
