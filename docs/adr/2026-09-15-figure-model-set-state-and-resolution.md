# The figure model: set state and resolution as the hub

Date: 2026-09-15
Status: proposed

Accepted at gate G1 (after M3 of the figure-model plan), where the user judges
the honest-ends treatment on the Stage and answers the four questions in that
plan's §Gates. Until then this ADR records the decision as taken and the
reversal it makes, so that the milestones building on it are not building on an
undeclared change.

## Context

The contra figure library is seventeen TypeScript closures, each re-deriving
contra facts on its own. Who is with whom is a hard-coded station table
(`figures/pairing.ts`). Figures are defined in the _formation's_ frame rather
than in their actors', so a swing scans the stations for a perpendicular pair to
find its end spacing and one dance overrides the answer by hand (`endHalf: 10`).
Seams are hand work: `chain.ts` threads `from` and `carried` between calls by
array adjacency at load time, and `balance-and-swing` splices two plans on the
rock boundary with a bespoke escape hatch. Parameters are flat scalars, so
"larks full hey, robins ricochet on the second pass" has no representation at
all. And there are three models of the same thing — the group figures, the older
`pair/` engine, and the data language in `figures/language/`.

The corpus makes the gap concrete. Of 5,842 Caller's Box dances with full text,
1,696 use a next neighbour mid-dance, 735 run two figures at once, 412 build
long waves, 398 bend a line of four, and about 340 end a hey short. None of those
is expressible in today's model.

Two earlier ADRs bear on this:

- `2026-09-13-choreography-model-and-decider-seam.md` froze `Frame` and
  `FigureDef` early, on the reasoning that "M5's pair figures and M8's contra
  library are written against them, so changing either is a reversal".
- `2026-09-14-figure-primitive-language.md` established an expression calculus
  with live cross-references and three-pass evaluation, over leaves that are
  **station ids in the minor-set frame**.

## Decision

**Set state and resolution become a new middle layer — the hub — in
`@caller/contra`, and figures become data defined in their actors' frame.**

### Five layers, with the hub in the middle

Call text; the dance record; **set state and resolution** (new); figure
definitions as data; and seams, which are _derived_ rather than authored.
Kinematics (`@caller/core`), the timeline seam, the decider, the oracles and the
hall renderer are unchanged. "Transitions are not a layer": they were the
symptom of figures being defined in the formation's frame instead of their
actors'.

### The hub is pure data, and lives in `@caller/contra`

`packages/contra/src/set/` holds `SetModel` — per dancer, a slot on the set's
lattice, a travel direction, a spot in world px, the hands they are holding, and
their partner binding — and the resolution of one call against it into
concurrent figure instances over disjoint actors, plus a hold-place instance for
everybody the call did not select. `packages/contra/src/library/` holds the
figure definitions.

Everything survives `JSON.parse(JSON.stringify(…))`. A `SetModel` names its
formation by **id** rather than holding the object, and the two pieces of contra
knowledge the hub needs from a formation — the lattice its slots index and the
relation table its words resolve through — are looked up from that id
(`set/SetRules.ts`). That is what keeps the model serialisable while
`homeOf(model, dancer)` still answers.

### Relations are formation-supplied offsets, derived and never stored

A slot is `{ line, position }`; a relation is a signed offset on that lattice,
and **which offset it is, is the formation's**. Duple improper's partner is the
other line at the same position and its neighbour is the same line one position
along; becket's partner is the same line one position along and its neighbour is
straight across. The same two words, the opposite two answers, from the same
lattice — which is precisely why a relation vocabulary cannot live in
`@caller/choreo` (`square.test.ts` asserts a square knows no `ones` and throws
on `shadow-pair`).

M1 builds partner and neighbour 1. Every other relation the corpus uses
_parses_, and `relate` throws `unsupported: <word> (M6)` until M6 fills the
tables in, so what is owed is a test rather than a memory.

### An instance is a `Group` whose stations are figure-roles

The planner mints a `Group` per figure instance and binds figure-role → dancer.
`FigureEvent`, `poseAt`, the seam ease, the oracles and the renderer are
untouched; nothing in `packages/choreo/src/timeline/` changes. The timeline
already admits several figure events over one span with disjoint dancers — it
indexes per dancer and the only rule `add()` enforces is that one dancer is not
in two overlapping events — so concurrency is a resolution matter only.

### `@caller/choreo` gains exactly one additive, form-neutral seam

`ScriptDeciderOptions.cycle?: CyclePlanner`: a pure function from one time
through's whole input (the dance, the formation, the registry, the hall, the
start beat, `standingAt`, and a `mintGroup`) to the cycle's figure emissions and
the hall afterwards. The default is `defaultCyclePlanner`, which is today's own
`emitCycle` emission half lifted out unchanged, and it is what `square.test.ts`
runs on. The decider keeps `emitFigure`, `standingAt`, the utterances and the
whole between-dances interval. **Choreo learns nothing contra**, which is AC7
of the figure-model plan and is checked at every milestone.

### Ends update state; hold continuity is bookkeeping

After an instance, each cast dancer's spot becomes the instance's honest end and
their holds become what the definition reports at its last beat. An instance
whose definition holds the same two hands its dancers already hold takes them as
carried in. This replaces `carryHolds`, and with it the whole idea that a seam is
something a dance authors: `chainCalls` stays in the repository for the old path
until M11 but is not on the new one.

### The `Frame`/`FigureDef` freeze is reversed, on purpose

The 2026-09-13 ADR froze `Frame` and `FigureDef` because the figure library was
written against them. The library is exactly what is being rebuilt, so the cost
the freeze protected against is being paid anyway, and paying it deliberately is
cheaper than working around a freeze that no longer protects anything. This is
recorded as a **reversal**, not as an additive change. `Frame` itself is
unchanged in M1; what is reversed is the commitment not to move it.

### The primitive language is re-targeted, not discarded

`2026-09-14-figure-primitive-language.md`'s central claims — live
cross-references between dancers, three-pass evaluation, an expression calculus
rather than flat JSON — carry over intact and become the shape interpreter (M2).
Its **leaves** do not: station ids in the minor-set frame are replaced by
figure-roles in figure frames and relations over slots. The move-data-layer
plan's later milestones are therefore not built on the old leaves.

### The transitions vision is absorbed

`2026-09-14-1827-move-transitions`' D1 (the beat boundary never moves), D2
(swings re-square), D3 (sequencing is not fusing) and D5 (no figure memory)
stand. Its rung one — honest ends — is structural here rather than a treatment;
its rung two, an exit hint, is replaced by ends stated as a target shape (M7).

### Amendment, M8: the dance record

The decision above put set state and resolution in the middle and said that the
record would have to grow to match. This is that growth, recorded here rather
than in an ADR of its own because it is the same decision seen from the record's
side: what a figure _is_ stopped being sequential, so what a dance _says_ stopped
being a flat list of one figure after another. `docs/dance-record.md` is the
whole format; this is what changed and why.

- **A call may carry other calls beside it** (`FigureCall.while`). The corpus's
  own `||`, in 735 dances, and "while" in 189 more. Q13 is answered by the code:
  the timeline has always admitted concurrent events over disjoint dancers, and
  what could not say so were the record and `chainCalls`. A branch is an ordinary
  call whose `beats` default to its parent's and which carries no branches of its
  own; the planner checks the actors are disjoint before anything is emitted, and
  **the hold-place complement is the complement of all the branches at once** —
  which is the one thing that cannot be computed a branch at a time.
- **A call may take no beats** (`beats: 0`). 44 corpus dances write one: "face
  your neighbour", "form a wave". A zero-beat call is a statement about where you
  end up, so it means something exactly when the figure's ends are structural
  rather than a ramp — every `waypoints` figure is.
- **A phrase name is a label**, not one of four letters. 113 corpus dances have
  phrases beyond A1–B2. `PhraseName` opens to a string and nothing reads it.
- **A record may hold more than one pass** (`passes`, `progressEvery`). The
  phrase list stays flat — all passes in order, `2A1 … 2B2` — so nothing that
  walks a dance's figures learns about passes, and what does change is where the
  progression fires: at the end of **every pass**, not of the record. The
  alternative shapes were rejected for the reason the flat list is chosen:
  a second `phrases` list would fork every consumer, and deriving pass two from
  pass one by a role swap would be a claim the corpus does not make (Anna's Reel
  writes both out, and the two are not each other's mirror in every phrase).
- **A record may carry figure definitions of its own** (`figures`, D10), under
  the id `<slug>/<name>`, with their texts in the same literal. The alternative
  was a library figure nothing else ever calls; the id carries the slug so that
  promoting one is a copy of one thing.
- **Canonical parameters may be written directly beside the shorthand.** A hey's
  pass list, a star's `places`, a schedule. They compose rather than compete —
  the star's new `amount` multiplies its `places`, so the eleven records that
  write `places` are untouched — because a caller's own words are sometimes not
  one of the shorthand's values ("star left 7/8").
- **`from` and `carried` still never appear in a file**, and the three
  call-level clauses that are not figure parameters — `rebind` (M6), `trade`
  (M7, Q10) and `form` (M7, Q6) — still ride in `params` and are stripped before
  any figure is planned, because `FigureCall` is `@caller/choreo`'s and all three
  are contra words (AC7).
- **Nothing contra crossed into `@caller/choreo`.** `while`, `beats: 0`, an open
  `PhraseName` and `passes` are all form-neutral: a square could use every one of
  them, and `src/testing/square.test.ts` is unchanged in meaning.

## Consequences

- **M1 is proved by construction, not by taste.** With the seventeen coded
  figures bridged as definitions, the ten demo dances through the new planner
  are pose-identical to the old path: 53 cases (every demo dance × every checked
  line length), two times through, every dancer, every 1/8 beat; worst
  difference 1.4 × 10⁻¹⁴ px of position, 1.3 × 10⁻¹³ ° of facing, 2.1 × 10⁻¹⁴ px
  of hand, against a 1 × 10⁻⁹ tolerance. Any diff here is a bug in the hub, not
  a tolerance to raise.
- **A dance record stops carrying derived places.** `params.from` and `carried`
  are computed at resolution rather than threaded at load, which is what lets a
  record hold concurrent calls (M8) and what removes the sequential assumption
  `chainCalls` bakes in.
- **The app is unchanged until M3.** The decider's default planner is still the
  default everywhere, so every golden, strip and plate is byte-identical through
  M1. M3 puts the new planner behind `?engine=new` and G1 judges it.
- **`pnpm dance <slug>` becomes the inner loop**, and the motion oracle becomes
  a gate with a written allowlist rather than an advisory report (director debt
  11, R6).
- **Amendments.** M8 has amended this ADR for the dance record — concurrent
  calls, zero-beat calls, phrases beyond A1–B2, multi-pass records, dance-local
  figures — under "Amendment, M8" above, with `docs/dance-record.md` as the
  format itself. M6's slots and M7's shapes are consequences of this decision and
  get no ADR of their own. M11 marks the freeze reversal complete when the old
  figure layer is deleted.

## Alternatives considered

- **A new package for the new layer.** Rejected (`vision.md` Q11): the swap is
  per figure and the hall demo must never change underneath, which wants
  coexistence in one package with sibling directories, exactly as `circle-data`
  already coexists.
- **Putting relations in `@caller/choreo`.** Rejected: becket and duple improper
  give opposite answers for "across" from the same lattice, so a relation
  vocabulary with contra meanings cannot be form-neutral. `square.test.ts` is
  the test that says so.
- **Keeping `chainCalls` and threading the new layer through it.** Rejected: the
  chain is sequential by construction (it threads by array adjacency) and the
  corpus needs concurrency in 735 dances. Reproducing the chain's answer exactly
  and then deleting it is what M1 does instead.
- **Fully independent actor deciders.** Rejected for now (`vision.md`): local
  steering would throw away the closure and reach guarantees for nothing the
  hall needs yet. Dancer-centric agency shows up at resolution; shared geometry
  is still computed together inside an instance. The actor decider (workbench
  M14) stays additive behind the same timeline seam.

## Amendment, M10 (motion profiles)

M10 fills in the timing half of a `FigureDefinition` and puts the feet
somewhere they can be answered for.

### The timing vocabulary

`TimingProfile.profile` was declared by M2 and consumed by nothing but the
figure lab's own printout. It now means something, and it has **three** values
that are genuinely different questions:

- **`smooth`** — one smoothstep over the leg. The pre-M10 default and what a
  figure that is not a walk keeps: a balance's 1 px rock, the hey's deliberately
  linear step on and off, slide left's own `stepped()` pace (S2, #52).
- **`trapezoid`** — the figure's own **explicit** four-corner speed window,
  written out in the shape as a `SpeedWindow` and read by `kinds/orbitPair.ts`.
  A figure that already says exactly how it accelerates does not want a general
  rule laid over it: the swing, the allemande, the do-si-do and the shoulder
  round.
- **`cruise`** — `@caller/core`'s constant-speed trapezoid with ramps of
  `min(1 beat, leg / 4)`. Up to speed in about a beat, hold the speed, down in
  about a beat, which is what a body walking _on_ the beat rather than easing
  through it does. Peak-over-average speed is 4/3 on any leg of four beats or
  fewer and 8/7 on an eight-beat one, against the smoothstep's 3/2 at every
  length.

**The ramp rule is the profile's, not a kind's.** `profileProgress` reads
`cruiseRamp` for itself, so every cruising leg in the library ramps by the same
rule and no shape kind picks a number. A fixed one-beat ramp on a two-beat leg
would be a triangle with no plateau at all — a 2.0× peak, worse than the
smoothstep it replaced — which is why the rule has the `leg / 4` half.

The **stretch** field is unchanged: whether extra beats buy distance or pace.

### The gait's home: the timeline, not the interpreter

M10's brief said the planted gait would be "an interpreter service reading the
kind's velocity". It is not, and the reason is structural:

1. The gait needs the body at beats **other than the one being drawn**. The
   plant at whole beat `k` reads the body there and its velocity at `k + 0.5`;
   a `PoseSample` is one instant and an interpreter is handed one `t`.
2. The plant a dancer is standing on at the start of a figure was put down
   during the **previous** figure, and a figure cannot see its neighbours.
3. **Three** different things produce poses — interpreted definitions,
   `@caller/choreo`'s own four engine figures, and, until M11, the bridged coded
   figures. A gait written for one of them would have left the other two with no
   foot motion at all the moment `quietMotion` stopped supplying it.

So the gait is a **pure function in `@caller/core`** (`plantedGait`, over a
`BodyPath`) applied by **`@caller/choreo`'s `poseAt`** to every sample whose
figure left `feet` undefined and whose `amp` is above zero, scaled by `amp`.
`poseAt` is the lowest layer that has a time-addressable body path for every
dancer on every path, knows the event's absolute `start` — which is what carries
the gait's parity — and can reach the figures either side.

M1's constraint that "nothing in `timeline/` changes" was M1's, not M10's.

The one kind that places its own `feet` is `orbitPair`, and it keeps doing so:
it knows its own body analytically, so it runs the same core function over its
own `placeAt` and fades the result into the buzz step. A figure that sets `feet`
still wins over the timeline's gait, exactly as it did over `quietMotion`'s.

### Consequences

- The body path `poseAt` builds reaches into the **neighbouring** figures in
  both directions. A plant that lands on a figure boundary is placed from the
  velocity half a beat later, which belongs to the next figure; without the
  forward reach the two sides computed different plants and the foot jumped
  about 2.7 px at every seam.
- Plants are memoised per (event, dancer) on a `WeakMap` keyed on the
  `FigureEvent`. A cache, not state: same timeline, same feet.
- `compareFigures` gains two allowed differences, `"feet"` and `"profile"`, both
  saying that the motion layer moved and the coded twin was deliberately left
  where it is (M11 deletes it). Neither weakens DD21: the ends, the joins and
  the hold places are still asserted, and every cruised carrier's end is exactly
  0 px and 0° from its twin's.
