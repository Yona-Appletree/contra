# @caller/contra

Contra as one form on top of `@caller/choreo`: the contra role set (lark,
robin), the contra figure library, and contra-specific dances and programs.

## Allowed imports

`@caller/contra` may import `@caller/choreo` and `@caller/core`. Nothing else
in this workspace.

The formations take their geometry through `@caller/choreo`, which re-exports
the slice of `@caller/core` a formation needs. The figures import
`@caller/core` directly: a figure's whole output is a `PoseSample`, and it
needs the arm solver, the quiet motion, seam easing, hand and foot
interpolation, the buzz and foot-rest constants and most of the geometry
helpers — thirty-odd names, which is a layer rather than a slice worth
re-exporting. Director ruling **DD17** settled it: a package may import any
package below it, not only the next one down. `AGENTS.md` says so, and
`scripts/check-deps.mjs` lists the edge.

`src/corpus/normaliseTitle.ts` normalises dance titles (whitespace, a
leading program-order number, case) for `scripts/corpus/import-portland.mjs`,
which derives `data/corpus/portland-programs.json` — see `data/README.md`.

## The role set — `src/roles.ts`

`CONTRA_ROLES` is `{ roles: ["lark", "robin"], top: "robin" }`. This is the
only place in the workspace those two words mean anything: `@caller/core`
reads `top` to stack joined hands and `@caller/choreo` never reads a role
name at all.

## The formations — `src/formation/`

Both lay their stations out in frame-local px, with local +y down the set
and local +x across it (see `@caller/choreo`'s README). The two long lines
are `ACROSS_PX = HOLD_SPACING_PX + LINE_OFFSET_PX = 32` apart, the plan's
AC3 number, and adjacent dancers along a line stand `PLACE_PITCH_PX = 20`
apart, which is the hall spike's 10 px per half-place retyped.

### `duple-improper`

Two long lines, larks alternating down each one, the ones travelling down
and the twos up. Hands four from the top is a scan down the line: pair each
couple travelling down with the couple travelling up below it, and let
anyone left over wait. With an even number of couples the pairing alternates
between starting at place 0 and place 1, so one couple waits at each end
every other time through; with an odd number one couple waits every time.
Both fall out of the scan, so there is no special case for either.

One time through swaps the two couples of a minor set, which moves the ones
one place down the line and the twos one place up. A waiting couple stays
where it is and changes direction; `wait-out` swaps its two stations, which
puts its lark back on the line the next time through expects.

### `becket`

Partners side by side facing the couple across the set, progressing by
sliding to their own left. A becket set has a waiting place beyond each end
(places `-1` and `places`), so it holds `2 × places + 2` couples. A couple
that has slid to the end spends one time through on the waiting place and
comes back in on the other line, one place along: that crossing is
`wait-out`'s `'mirror'`, in a frame centred halfway between the two places,
so the one built-in figure does becket's end effect and duple improper's.

**An odd number of couples** cannot fill a becket set — two couples stand at
every dancing place, one from each line — so the odd one out takes a second
waiting place beyond the bottom end. The set then alternates between `places`
dancing places and `places − 1`, which is what a real line of five couples
does: somebody is always out, and never the same couple twice running. The
oracle checks five couples as well as the even lengths, because the demo
hall's longer line is five.

**Where a becket set sits.** `SetSpec.centre` is where a line's _first_ dancer
stands, which is what it means for a duple improper set, and a hall hands the
same point to both formations. A becket set's first dancer is at place `-1`,
so `BECKET.start` puts the frame `BECKET_TOP_OFFSET_PX` (one waiting place
plus half a couple, 50 px) down the hall from it. Without that a becket line
in the demo hall would start 50 px above the top of the dance floor, on the
stage.

**A dance that progresses in its first figure** — Butter shifts left in its
first two beats — begins on {@link BECKET_BEFORE_SLIDE} rather than on the
stations: every dancer, the waiting couple included, is one couple place back
along their own line and slides in. That is `Dance.startPlaces`; see
`@caller/choreo`'s README.

Becket's closure is proved the same way duple improper's is, by a sequence in
`src/figures/sequences.ts` that the script decider dances: everything in it
returns to the places it started on, and `slide-left` at the end is the
progression. It closes to 3.4 × 10⁻¹⁴ px at every line length from four
couples to twelve. (M7 could not write that fixture, because the engine's
placeholder figure maps a station of a group on to a station of the _same_
group and a becket couple's progression takes it out of its group frame
entirely — which is what `slide-left` is for.)

## The figure library — `src/figures/`

Every figure the demo's dances call, on `@caller/choreo`'s `FigureDef` and
`Group` contract, plus the registry a decider dances from
(`createContraRegistry()`).

### The table

`lead` is how many beats before the figure the caller starts saying it; every
figure here is 4, except the engine's `wait-out`, which nobody calls. `beats` is
the figure's natural duration — a dance may say otherwise, and the figure is
told what it actually got. Every parameter list starts with `from`, which is
where the dancers already stand (below); the defaults given are the rest.

| id                       | beats | call                           | parameters (defaults)                                                                                                        |
| ------------------------ | ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `balance`                | 4     | `BALANCE`                      | `rock` 1.0 px, `hold` `"two"` (or `"one"`, `"none"`), `hand` `"R"`, `pairs` `"neighbors"`, `holdDrop` 5, `stackPx` 1         |
| `balance-ring`           | 4     | `BALANCE THE RING`             | the same, with `hold` `"ring"` and `holdDrop` 6                                                                              |
| `swing`                  | 8     | `SWING`                        | `pairs` `"neighbors"`, `turns` 2, `handOffset` 5 px, `endFacing` `"across"` (or `"up"`, `"down"`, degrees), `endHalf` `null` |
| `balance-and-swing`      | 16    | `BALANCE AND SWING`            | `balanceBeats` 4, then the balance's and the swing's own parameters                                                          |
| `allemande`              | 8     | `ALLEMANDE`                    | `pairs` `"neighbors"`, `hand` `"L"`, `amount` 1, `inward` 45°, `holdDrop` 2, `endHalf` `null`                                |
| `do-si-do`               | 8     | `DO-SI-DO`                     | `pairs` `"neighbors"`, `amount` 1, `swellPx` 2.5, `endHalf` `null`                                                           |
| `long-lines`             | 8     | `LONG LINES FORWARD AND BACK`  | `forwardPx` 9, `holdDrop` 8, `stackPx` 1                                                                                     |
| `circle`                 | 8     | `CIRCLE LEFT`                  | `direction` `"left"`, `places` 3 (quarters), `holdDrop` 6, `stackPx` 1                                                       |
| `star`                   | 8     | `STAR RIGHT`                   | `hand` `"R"`, `places` 4 (quarters), `holdDrop` 3, `stackPx` 1.2                                                             |
| `petronella`             | 4     | `PETRONELLA TURN`              | `places` 1 (to the right), `spins` 1                                                                                         |
| `california-twirl`       | 4     | `CALIFORNIA TWIRL`             | `pairs` `"partners"`, `holdDrop` 0                                                                                           |
| `right-and-left-through` | 8     | `RIGHT AND LEFT THROUGH`       | `couples` `"partners"`, `passBeats` 3.5, `bowPx` 5, `holdDrop` 6, `stackPx` 1                                                |
| `robins-chain`           | 8     | `ROBINS CHAIN`                 | `chains` `"robin"`, `pullBeats` 4.5, `bowPx` 5, `holdDrop` 6, `stackPx` 1                                                    |
| `pass-through`           | 4     | `PASS THROUGH`                 | `direction` `"across"` or `"along"`, `bowPx` 5                                                                               |
| `roll-away`              | 4     | `ROLL AWAY WITH A HALF SASHAY` | `pairs` `"partners"`, `roller` `"robin"`, `bowPx` 4.5, `spins` 1, `holdDrop` 6                                               |
| `slide-left`             | 4     | `SLIDE LEFT ALONG THE SET`     | `alongPx` 40 (a couple place), `direction` 1                                                                                 |
| `hey`                    | 16    | `HEY FOR FOUR`                 | `start` `"robins-right"` or `"larks-left"`, `half` false, `trackPx` 5, `joinBeats` 2                                         |
| `wait-out`               | 64    | `WAIT IT OUT AND CROSS OVER`   | the engine's, less `crossTo` — see below                                                                                     |

A `pairs` (or `couples`) parameter names who dances with whom: `"partners"` is
`1L`–`1R` and `2L`–`2R`, `"neighbors"` is `1L`–`2R` and `1R`–`2L`, and a dance
may write the pairs out instead. Both contra formations name the same pairs with
the same station ids, which is what lets one library serve both: in duple
improper your partner is across the set and your neighbour is beside you down
the line, and in becket it is the other way round.

### Where the dancers already are — `from`

A figure is a pure function of the group, so a figure that does not begin at the
stations has to be told where its dancers stand. `ContraParams.from` carries
that, as places in the group frame's own axes, and defaults to the stations.

Threading it by hand would be unreadable and wrong within two figures, so
`chainCalls` and `contraDance` do it: each figure answers `moves(params,
stations)` with where it leaves everybody, and the next call is handed the
answer. What comes out is still plain data — numbers — so a dance survives
`JSON.parse(JSON.stringify(dance))`, which is what the engine requires. A call's
`who` is honoured: dancers a selector leaves out stay where they are.

Every figure does its geometry in those frame-local px and is turned into world
px once, at the boundary. The transform is rigid, so `shouldersAt`, `bodyPoint`
and the arm solver mean the same thing either side of it, and a figure's `ends`
come out exact rather than through a round trip. Every figure's test runs on a
frame that is deliberately **not** the identity, because a figure that has
quietly worked in world px passes at the origin and fails there.

### What nobody lets go of — `carried`

When one figure ends holding a hand and the next begins holding the **same**
hand of the **same** two dancers, nobody lets go: the hand is one shared floor
point across the boundary and moves continuously from where the first figure
held it to where the second does. Only a hold that actually changes — a
different partner, a different hand, or none — is released and retaken.

`ContraParams.carried` says which, and is threaded exactly as `from` is:
`chainCalls` asks each call what it is holding at its last beat (`joins(params,
beats, …)`) and what the next one holds through its middle, and writes the
overlap into the first call's `carried.out` and the second's `carried.in`. A
carried hold makes the figure's take or release a window of no length, so
`takeAndRelease` returns the joined point rather than a ramp off the hip. It is
plain data — station, side, and whose hand it is in — so a dance still survives
`JSON.parse(JSON.stringify(dance))`, and a dance never writes one by hand.

`contraDance` threads the whole dance as one run and cuts it back into phrases,
so a hold carries across a phrase boundary as well as inside one.

### Two dancers passing

In this coordinate system — y down, angles from +x toward +y — two dancers pass
**right shoulders** when each bows to their own **left**. `passRight` is the
helper; `@caller/choreo`'s `walkStep` bows the other way, and its comment says
that is a right-shoulder pass, which it is not.

### Making room for the pair beside you

Two pairs of a minor set dance a figure for two at the same time, and in duple
improper their centres are one place pitch — 20 px — apart while the lines are
32 px apart. A swing at M5's radius, or an allemande at M5's, or a do-si-do at
half the line's width, does not fit into that: two dancers of _different_ pairs
pass 7.86 px apart, inside AC6's 8 px.

So a figure for two takes a tighter hold when another pair is close:
`orbitRadius` (and the swing's own `SWING_CLEARANCE_PX`) shrink the turning
radius until the gap is 8.5 px, and at any wider spacing nothing changes and the
figure is M5's exactly. **This is a scale tension, not a figure bug**: the place
pitch is 20 px where a real line's is nearer the width of the set. If the
director widens `PLACE_PITCH_PX`, these clamps stop firing on their own.

### `wait-out`, wrapped

`@caller/choreo`'s `wait-out` knows two crossings — `'swap'` for a couple facing
each other across the set, `'mirror'` for a becket couple side by side — but the
script decider hands every waiting couple the figure's own **defaults**, so a
becket set got the duple improper crossing and ended 51 px from its station.
`src/figures/wait-out.ts` is registered under the engine's id and reads the
crossing off the couple's own stations instead: dancers who face each other
swap, dancers who face the same way mirror.

It also dances the mirror as a couple. The engine sends each dancer along their
own straight line to the point opposite through the frame centre, and for a
couple standing side by side those two lines cross — 1.74 px apart at the
tightest. Turning the couple about its own midpoint while the midpoint travels
reaches exactly the same two places, because a point reflection _is_ a half
turn, and it loops 10 px beyond the end of the set so it does not share a lane
with the couple sliding out of the place it is coming back to.

Since F2 the crossing is reckoned from where the couple _started_ the figure
rather than from the waiting place, so a becket dance that progresses in its
own first figure — the waiting couple slides off the end of the line with
everybody else — lands one place short of the waiting place, ready to slide in
again. With no `startPlaces` the two are the same point and nothing moves.

(M9 closed the engine's other debt here: `createScriptDecider` now takes
`wait-out` from the registry, so the wrapper's `ends` are the ones the
between-dance line-up walks from.)

### What the tests hold every figure to

`probeFigure` walks a figure at every eighth of a beat and `figureProblems`
turns what it finds into sentences. Four questions, the plan's numbers:

| question                                                                                         | limit          |
| ------------------------------------------------------------------------------------------------ | -------------- |
| Does every arm reach the hand the figure placed? (AC1)                                           | `short === 0`  |
| Is every hand the figure says is joined one floor point?                                         | 0.1 px         |
| Is the pose at `t = beats` where `ends` says, and at `t = 0` where the figure was told to start? | 0.01 px        |
| Does anybody come closer than AC6 allows?                                                        | more than 8 px |

Nothing in the library needs a declared contact: even a swinging pair stays
further apart than AC6's distance, so the sequences check every pair with no
exemption at all.

### The sequences — `src/figures/sequences.ts`

Two dances the script decider dances, one per formation, which is where AC5
lives:

- **duple improper** — circle left ¾, swing your partner; long lines, robins
  chain; star left half, do-si-do; balance and swing your neighbour. The star
  goes **half** way round: the brief that asked for this sequence does not say
  how far, and the dance only progresses for that answer, because the neighbour
  swing at the end is the identity on places from a becket-like arrangement.
- **becket** — circle left once, long lines; right and left through, and back;
  star right once, star left once; balance and swing your partner, slide left.
  Everything but the slide returns to the places it started on, and the slide is
  becket's progression.

Closure, reach and collisions over eight times through, at every line length:

| formation      | couples | closure        | `short` | min torso distance |
| -------------- | ------- | -------------- | ------- | ------------------ |
| duple improper | 2–6     | 1.8 × 10⁻¹⁴ px | 0       | 9.516 px           |
| becket         | 4–12    | 3.4 × 10⁻¹⁴ px | 0       | 10.000 px          |

`src/dances/` holds the encoded dances, each sourced from its own page on The
Caller's Box; `dances.test.ts` runs every one of them through the same three
oracles at every line length its formation is checked at. **Butter** (Gene
Hubert, becket) is the one that progresses in its own first figure: closure
≤ 2.9 × 10⁻¹⁴ px, `short` 0, min torso distance 10.000 px, at 4, 5, 6, 8, 10
and 12 couples.

### Where the library is a model rather than a transcription

- **The hey** is one closed lane — out along one side of the middle, round the
  end, back along the other — walked at a constant speed. Two dancers cross the
  middle while the other two loop, and then they swap, which is a hey; but the
  loops are the same width as the lanes and the four passes land at about 2.7,
  5.3, 10.7 and 13.3 of the sixteen beats where a caller would say 2, 6, 10 and 14. Who steps off falls out of the formation: the pair standing at the ends of
  the outgoing side, which in duple improper is the robins passing right
  shoulders. In a becket set the robins stand on the other diagonal, so the same
  two dancers pass the other shoulder — which is why a becket dance calls its
  hey from an improper-like arrangement rather than from the becket start.
- **A courtesy turn** is the couple turning as one about the point between them
  with their left hands joined; the lark's right hand is not on the robin's back,
  because at a place pitch apart it would not reach.
- **A chain** leaves the lark where it found him, turning to take the incoming
  robin's hand as she comes round, rather than backing all the way round her.
- **A roll away** lets the hands go as the roll turns: a dancer spinning a whole
  turn cannot keep a hand on a point 10 px away and still have an arm that
  reaches it.

### The demo dances this library covers

`data/corpus/demo-dances.json` names twelve dances but holds no choreography;
`data/corpus/portland-programs.json` holds the callers' own feature notes, which
is the most this repository can say. Against those notes:

| dance                       | covered | what is missing                                                  |
| --------------------------- | ------- | ---------------------------------------------------------------- |
| Butter                      | yes     | "full hey" — `hey`                                               |
| Heartbeat Contra            | yes     | "Petronellas" — `balance-ring` and `petronella`                  |
| Airpants                    | yes     | "Glossary": standard figures only                                |
| Simplicity Swing            | yes     | "glossary": standard figures only                                |
| A Thing of Trust            | no      | pousette (M8 scope says later)                                   |
| Theory of Mind              | no      | Rory O'More — short waves (later)                                |
| You Can Get There From Here | no      | Rory O'More, give and take (both later)                          |
| Diamond Allotrope           | no      | short waves, a diamond, a ricochet hey (all later)               |
| Spring Break                | no      | a ricochet hey (later); its balances and petronellas are here    |
| Frederick Contra            | no      | down the hall four in line — a figure that leaves the minor set  |
| Zag It Back                 | no      | slice, weave the line                                            |
| The Judge                   | no      | a diagonal chain — a pairing with a couple outside the minor set |

Two of those are worth calling out as _structural_, not merely unwritten:
**down the hall** and a **diagonal chain** both need dancers who are not in the
group, and a `Group` is one minor set. A figure over a bigger frame — a hall
figure, or a group of eight — is a model change, not another file in here.

## The pair figures — `src/pair/`

The five figures the gate-3 two-dancers spike settled, plus the fall back that
closes its sequence, as parameterised definitions over `@caller/core`'s pose
contract. Behaviour was read from `spikes/two-dancers/index.html` and retyped;
production code never imports from `spikes/`.

This is the **pair page's own model**, and it stays: the G1 goldens and the
nine per-figure strips are pixel comparisons against exactly this code, so
nothing in it has changed. What M8 added is `src/figures/`, the library on
`@caller/choreo`'s group contract — the same dancing, on the engine's terms.
Where a number was settled at gate 3 the library **imports it from here**
rather than restating it: the swing's radius, lateral offset, body turn, hand
drop, back and shoulder hands, lean, flare and buzz feet; the balance's rock
profile, back ratio and lean cap; the allemande's turn radius; the trapezoid
speed profile. The hanging hand is `@caller/core`'s.

The package exports these six under `pair`-prefixed names — `pairBalance`,
`pairSwing`, `pairAllemande`, `pairDoSiDo`, `pairWalkIn`, `pairFallBack` —
because the library exports a `balance` and a `swing` of its own, and those are
the ones a dance calls.

### The contract

```ts
interface FigureDef<P extends object> {
  readonly id: string;
  readonly call: string;
  readonly lead: Beat;
  readonly beats: Beat;
  readonly params: readonly (keyof P & string)[];
  readonly defaults: P;
  beatsOf?(params: P): Beat;
  sample(frame: PairFrame, role: PairRole, t: Beat, params: P): PoseSample;
}
```

`sample` computes **both** dancers from the frame and returns the one asked
for, so a joined hand is literally one floor point that both roles carry —
not two points that agree to a tolerance. `pairCall(def, frame, params)` binds
a figure to a frame and erases `P`, which is what a sequence holds.

### The figures

| id          | beats | parameters (defaults)                                      | what it does                                                                                                                                   |
| ----------- | ----- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `walk-in`   | 4     | none                                                       | From the lines, `LINE_OFFSET_PX` further apart, in to the hold; the take is animated over the last beat and a bit.                             |
| `balance`   | 4     | `rock` 1.0 px, `takeHands` false                           | Rock forward then back with two hands joined, feet planted. `takeHands` is for a balance that follows a figure with the hands down.            |
| `swing`     | 8     | `turns` 2, `handOffset` 5 px, `beats` 8, `endFacing` null  | Ballroom hold, buzz step, open out with the lark on the left. `handOffset` is how far in from the joined shoulders the outstretched hands sit. |
| `allemande` | 8     | `hand` `"L"`, `amount` 1, `inward` 45°, `startFacing` null | One hand at the centre; each body turns `inward` degrees toward that centre so the arm has something to pull against.                          |
| `do-si-do`  | 8     | none                                                       | Round back to back with the hands down and the facing kept; only the head follows.                                                             |
| `fall-back` | 8     | `release` true                                             | Let the hands go and walk back to the lines.                                                                                                   |

`endFacing` and `startFacing` default to `null`, which means "take it from the
frame": a swing ends on the line its turning stopped on, and an allemande
starts facing across the pair, which is where a swing leaves it. That default
is what makes swing → allemande close exactly.

### Tuning numbers, and where they came from

Everything below is a figure parameter or a module constant in this package.
**No rendering-contract number was changed**: shoulders are still 11 px, reach
15, hold spacing 14, lines 18 further, 4 cm per px, and the spike's 10.4 px
shoulders were not restored.

- **`balance.rock` is 1.0 px**, where the spike rocked 1.3. The back rock is
  `BALANCE_BACK_RATIO = 1.4 / 1.3` times it, the spike's own asymmetry. The
  pose's `lean` is capped at `BALANCE_LEAN_CAP = 1.0` px.
- **`HEAD_LEAN_FOLLOW` in `@caller/hall` is 0.5**, where the spike drew 0.8.
  Together with the smaller rock this moves a balancing dancer's head 2.4 px
  forward of their standing place instead of 3.0, so at the closest point of a
  balance the two head centres are 9.2 px apart instead of 8.0 — a gap of
  3.4 px between a 2.9 px skull and its partner's, where the spike had 2.2 px
  (2.8 and 1.6 for the wider `bob` and `curly` heads). Gate G1 question 2.
- **`swing.handOffset` is 5 px** and **`allemande.inward` is 45°**, the two
  gate-3 tweaks, now parameters. The allemande's was 20° at gate G1 and the
  user rejected it — "the torso should be rotated towards the other person so
  the arm is angled _forward_ not back" — so 45° is F1's answer. `handForwardAngle`
  measures it: the joined hand stays 70° forward of the shoulder line for the
  whole of the turn, against 43.2° at 20°.

### The invariants these hold

Every figure's test walks it at every eighth of a beat and asserts
`solveArm(...).short === 0` for both dancers (plan AC1), solving the arms
exactly as `@caller/hall` does: body position quantised, shoulders hung off
the swayed torso. `armShortfall` and `worstShortfall` are exported so M8's
figures can use the same probe.

`DEMO_PAIR_SEQUENCE` is the spike's 64 beats. Its test asserts AC1 over the
whole loop, that each figure's end pose is the next figure's start pose within
0.01 px (`poseGap`), and that a hand pair within the renderer's
`JOIN_EPSILON_PX` is the same point and the same height unless a take or a
release is in flight through that band.

`poseGap` deliberately ignores `stepRate` and `amp`. Both are rates rather
than positions, and at a figure boundary — where every figure here is
momentarily still and the step phase is exactly zero, because every figure
starts on a whole beat — neither moves a pixel.

### Deliberate differences from the spike

- **Hanging hands are explicit.** A figure emits a real `Hand` for a hand at
  the dancer's side rather than `'down'`, because `easeSeam` cannot
  interpolate `'down'` (it switches at the midpoint of the seam) and because
  every take and release has to animate out of somewhere. `handDown` **is**
  `@caller/core`'s `hangingHand` — F3a moved the resting-arm model down into
  `core`, so this package no longer keeps its own copy of the `HAND_HANG_*`
  numbers and there is nothing left for the two copies to disagree about.
- **The arm swing starts and ends at zero.** The spike's `walk-in` opened with
  the arms already swinging while `fall-back` closed with them still, so the
  hanging hands jumped up to 0.8 px at three seams and the seam ease hid it.
  Ramping the swing in over the first 0.4 beats and out before the end closes
  those seams exactly.
- **`fall-back`'s weight shift tapers out** over its last beat, for the same
  reason, and is measured from the figure's own beat rather than the dance's.
- **The swing fades its sway out instead of cutting it.** `core`'s `buzz` is a
  boolean that replaces the feet outright, so the swing keeps `buzz: false`,
  places its own feet (walking cross-faded into the buzz step, as the spike
  did) and uses `amp` to fade the torso sway out as the buzz comes in.
- **Both dancers flare.** The spike gave the skirt flare to the robin only;
  flare comes from turning, so both get it. Invisible in the demo's default
  look, where nobody wears a skirt.

## The figure primitive language — `src/figures/language/`

A figure can be **data** instead of code. `compileFigureSpec(spec)` returns
the same `ContraFigure` `contraFigure({ plan })` returns, so a compiled figure
and a coded one are the same thing to the registry, the decider, `chainCalls`,
the three oracles and the renderer. See
[`docs/adr/2026-09-14-figure-primitive-language.md`](../../docs/adr/2026-09-14-figure-primitive-language.md)
for why the language is an expression calculus rather than flat JSON, and
what changed shape on contact with this code.

The short version: a hand join round a ring is the midpoint of two dancers'
shoulders **at the beat being drawn** (`ringHands(ctx, ring, (id) =>
placeAt(id, t), …)`), so a figure language with no cross-references cannot
express a figure this library already ships. `{ point: "live", station }` is
the minimum that can, and it makes the interpreter a three-pass evaluator —
ends, then every station's place at `t`, then hands against that — rather
than a template.

`language/expr.ts` holds the calculus (`NumberExpr`, `AngleExpr`,
`StationExpr`, `PointExpr` and their evaluators), `language/figureSpec.ts`
the data shape (`FigureSpec`, the `ringWalk` segment, the `down`/`joined`/
`carried` hand primitive), and `language/compileFigureSpec.ts` the
interpreter. Specs live in `src/figures/specs/`.

`specs/circleSpec.ts` is `circle` written in it. The coded `circle.ts` and
`CONTRA_FIGURES` are untouched — coexistence is the default, and the
compiled figure carries its own id, `circle-data`. Its test is the proof:
the identical `PoseSample` at every 1/8 beat in both formations across five
parameter sets, identical `ends`/`moves`/joins and probe numbers, and both
sequences dancing to identical closure, reach and collision reports with the
compiled figure swapped in through `createContraRegistry`'s `extra` array.

M1 lands one segment kind (`ringWalk`) and one segment per track. `walk`,
`orbitPair` and `oscillate`, segment sequencing, `carried` holds, dance-local
figures and the `describe`/`assertions` fields are later milestones; the
compiler names the milestone when it meets one.

## The motion oracle and the figure checks (F3a)

Three files and a report, built to make jank _measurable_ rather than to fix
any of it. F3a deliberately fixed no figure: a figure fixed then is a figure
whose defect the instrument never got to prove it could see.

- **`figures/motionBounds.ts`** — how fast a drawn arm is allowed to move,
  derived from this library rather than picked. The fastest legitimate hand
  motion here is a one-beat `takeAndRelease` take; `takeExtremes` finds the
  registry's own worst geometry (a hand 17.8986 px from its hip in
  `right-and-left-through`, lifted to a drop of 0 in `swing`) and
  `deriveTakeMotion` measures what that take does at 1/32 beat. Each bound is a
  **guard at 3×** the measured maximum — 80.44 px/beat of hand, 65.17 px/beat
  of height, 3.6 px of out-and-back — not a tuning target. `motionBounds.test.ts`
  re-derives every one and fails if the code moves underneath.
  **The elbow bound is useless and that is a finding**: a straight take moves the
  elbow at 9.33× the hand's speed, because a hanging hand sits 0.14 px from its
  own shoulder on the floor and the elbow's azimuth is very nearly undefined
  there. Read the report's elbow column against its hand column instead.
- **`figures/figureChecks.ts`** — each figure's `describe` turned into
  `@caller/choreo` trajectory assertions, with the windows taken from the
  figure's own declared joins where there is one.
- **`figures/knownWrong.ts`** — the fourteen assertions that fail today, each
  with its measurement and one line of why. `figureChecks.test.ts` holds both
  halves of the contract: everything **off** the list passes, everything **on**
  it still fails, so a fix has to delete its row. Nothing is skipped and nothing
  was loosened.
- **`pnpm report:motion`** writes [`docs/motion-report.md`](../../docs/motion-report.md):
  the derived bounds and their derivation, the ten worst figures and the ten
  worst seams over the ten demo dances, every figure measured alone, the
  known-wrong table, every assertion with its evidence, and what every figure
  says it does.

Every figure in `createContraRegistry()` carries a `describe`: two to four
sentences of what the dancers do, in a caller's words. `star` and
`california-twirl` are marked `(unsure: …)` — a caller should correct those
two. `slide-left`'s marker is gone: S1 settled it as a sidestep with the torso
square to the other line, danced in two steps, and the figure now says so.
