# @caller/kinetics

Engine 3: a compiler from a dance to proved motion. `@caller/lang` reads the
`.dance` text and says what every dancer does on every beat; this package
takes that and, through a figure language of timed constraints and a
per-dancer per-beat assembly, makes continuous trajectories for every body
point, each under a physical cap with no discontinuities, proved once on
the executor rather than per figure. Vision and plans:
`Planning/contra/_archive/2026-09-16-2348-kinetics-model/` (`vision.md`
D1–D17) and `Planning/contra/2026-09-18-0008-kinetics-on-lang/`.

## Where a dance comes from

A dance is a `.dance` file in `packages/lang/dances/`, and `@caller/lang`
owns every word of it: the grammar, the checker, the tree `setup` builds and
the per-beat timeline the script leaves behind. This package starts where
that stops — `src/sequence/fromLang.ts` turns an evening into the compiled
sequence the scheduler takes, and nothing below that file knows there is a
language ([the ADR](../../docs/adr/2026-09-18-kinetics-consumes-lang.md)).

```text
fn butter(minor-sets: i32) {
  setup { MajorSet(1, minor-sets = minor-sets); }
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
  // …A2, B1, B2 — see packages/lang/dances/butter.dance whole.
}
```

Two things the adapter will not do quietly, both `K`-coded and both at the
call's own span in the `.dance` file:

- **A move whose `ir` no figure answers to** is a diagnostic and a stand for
  its beats — never a crash and never a silent stand. `contra.dance`'s
  `promenade` is the one left.
- **A figure that wants a dancer or a ring the move never names** is the same
  thing said about the cast, and so is a role word nobody on the floor
  dances. A figure that silently stands is a dance that silently goes missing.

**The frames have opposite handedness**, and the adapter is where that is
fixed: the language says a node's own `+x` is to its right, and this engine
says a dancer's right is `facing + 90°`. `dialect/langDialect.ts`'s `posePx`
mirrors `x` — which keeps the hall's top at the top and makes left left.

## Allowed imports

`@caller/core` (the geometry, the time layer, `RENDERING_CONTRACT` — never
`core/src/kinematics/*`, which this engine replaces;
`src/allowedImports.test.ts` fails on their names); `@caller/lang` (the
language: a dance's text, tree and timeline); and, for the debugger's pixels
pane only, `@caller/hall`'s people drawing. **Nothing imports this package**:
`scripts/check-deps.mjs` lists `kinetics` in no other package's allowed set.

## The layers, and who owns each

| layer             | what it is                                                                                                                                                                                                                                                                    | file                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| language          | lexer, parser, checker, evaluator — somebody else's package                                                                                                                                                                                                                   | `@caller/lang`                                   |
| tree              | the floor `setup` built: nodes, places, anchors, and who stands where at every commit                                                                                                                                                                                         | `@caller/lang`, `packages/lang/dances/`          |
| compiled sequence | one script per dancer: calls with beats, this dancer's cast, the arguments and the seating each was read against                                                                                                                                                              | `src/sequence/fromLang.ts`                       |
| moves             | each move's parameters and the figure its `ir` names                                                                                                                                                                                                                          | `packages/lang/dances/contra.dance`              |
| figure IR         | a figure as timed constraints: `pre`, soft `post`, windows (orbit, walk, pass, pivot, walk-to-seat, stand, intrinsic, path, parallel), look rules, casts — the chain is two roles' paths side by side then a couple's orbit; the hey one closed track through the four places | `src/ir/Figure.ts`, `src/figures/*.ts`           |
| dialect           | what the rest of the stack reads of the floor: who, which role, where at beat 0, home; made from the tree                                                                                                                                                                     | `src/dialect/langDialect.ts`                     |
| schedule          | entry, body and exit per call, the exit back-chained from the next figure's `pre` onto this one's soft end; hand seams; nobody stands; elision; home is the place at the call                                                                                                 | `src/schedule/schedule.ts`                       |
| assembly          | one slot per dancer per beat: step, pivot, hold, drop, lean, look, buzz, stand; the listing in a dancer's words                                                                                                                                                               | `src/asm/*`                                      |
| executor          | slots to continuous effector trajectories: hips and facing on a natural cubic spline, feet by cadence, hands on cosine ramps                                                                                                                                                  | `src/executor/*`                                 |
| solver            | joints from effectors: shoulders, two-bone arms with a hold's swivel, hand plates, a head solved toward a point                                                                                                                                                               | `src/solver/*`, `src/holds/*`                    |
| proof             | speed and acceleration under each point's cap, no jumps, at 16 samples a beat; and no two hips closer than a body's clearance (`K304`), which only the whole set's executed motion can say                                                                                    | `src/motion/prove.ts`, `src/motion/clearance.ts` |
| debugger          | every layer on one page, one bar through all of them                                                                                                                                                                                                                          | `debugger/`                                      |

## The debugger

`pnpm --filter @caller/kinetics dev` → http://localhost:5177. A dance from
`packages/lang/dances/`, a hall size and a number of times through; one
dancer to follow. Panes: **source** (every file the dance reads, editable,
with the call under the bar lit in the file it was written in, its arguments
and its figure IR), **layout** (the floor `setup` built: places, anchors,
group hulls), **timeline** (calls with entry, body, exit and seams; a
membership lane per dancer coloured by minor set, hatched when out),
**listing**, **3d** and **pixels** (the bodies, with group boxes at the bar's
seating; the pixels pane draws the app's own people on black, the wireframe
behind a toggle), **graphs** (every point against its cap), **tree** (the
language's tree with the seating at the bar, the followed dancer's lineage
lit). The strip above them groups every layer's complaints and clicks through
to the beat and the dancer.

## The caps

Physical constants in cm/s and cm/s², converted at the dance's tempo
(`px/beat = cm/s × 60/bpm ÷ 4`), never derived from any library
(`src/units/caps.ts`). At 112 bpm: hip 140 cm/s and 250 cm/s² (18.75
px/beat, 17.9 px/beat²); feet 300 / 1200; hands 220 / 900; shoulders and
head 170 / 350; elbows 200 / 800. Angular: yaw 400°/s, lean ±15° at 60°/s,
look ±70° at 300°/s. Assembly limits (`src/units/limits.ts`): a step ≤ 75 cm
(a warning above 60), a pivot ≤ 90° while stepping, a take ramps over
`TAKE_BEATS` = 2.

## The windows a figure is made of

An **orbit** (a swing, a circle, an allemande, a courtesy turn — `facing:
"couple"` has the one on the left back round with the one on the right, and
`openPx` lets the pair out on to the places over the last two beats), a
**walk**, a **pass**, a **pivot**, a **walk-to-seat**, a **stand**, an
**intrinsic** (a balance or a bow, authored line by line), a **path** and a
**parallel**. A `path` is waypoints at beats in the figure's **lane frame**
— across the lane in half-widths, along it in half-places, each dancer's own
from their own side — so one list of points is one closed track every
dancer walks: the hey's, through the four places, a quarter of a lap apart,
with `left` offsets where two dancers pass (negated for a hey by the left)
and a phase per role. A `parallel` runs one window per role over one span:
the chain's pull-by while the lark receives. A window may take holds at its
start (the courtesy hold as the pull-by ends), and its share of the body may
come from a parameter (a hey's lap is `16 × amount − 4` beats).

## The seams

A hold the next figure needs and this one already has is **carried**; a take
whose hands are free during the previous figure's last beats **overlaps**
them; otherwise it costs an entry slot; a drop overlaps the next figure's
first beat when its `pre` needs no hands. A walk ramps (half a step to start
from standing, half to stop). An orbit **spirals out** over its last beats to
where the next figure starts, its rotation frozen unless the next figure
orbits too. A `free` orbit turns as many times as its rate allows and ends
where its `post` says (a swing: beside the partner, facing home, in the line).
A path has no ramp of its own: its waypoints are on their beats, so a hey
started from rest pays at its first step, and a courtesy turn — a whole turn
in four beats, at the rate cap — cannot be followed by a figure that begins
standing still, which is why the hey's other role loops in rather than waits.

## Running

```bash
pnpm kinetics check butter --minor-sets 3 --times 7   # the whole stack, headless
pnpm kinetics check fixture                            # the pair, forty beats
pnpm --filter @caller/kinetics test
pnpm --filter @caller/kinetics dev     # the debugger, http://localhost:5177
pnpm --filter @caller/kinetics build   # dist/debugger/
```

`pnpm kinetics check` is this engine's own oracle: it loads every `.dance`
file, checks it, runs the evening, joins it to the figures, schedules,
executes, solves and proves, and prints every layer's complaints in one
shape — the language's, rustc's — with the line and a caret. It exits
non-zero the moment anything is an error. `--json` is the same for an agent.

## What is deliberately not here yet

The promenade; a buzz-step swing; the holds gallery and approvals (the
chain's courtesy hold and the pull-by's right hands are placeholders — the
pull-by's are not even taken, the other robin being outside the pair's
cast); the other becket end (Q1 of the kinetics plan); triple minor's
progression is an approximation; a half hey from the language (the figure
takes `amount`, `contra.dance`'s `hey` does not pass it yet); moving the
engine to metres; editor support; publishing the debugger at `/spikes/`. And
the seams the tests pin rather than hide: a straight entry walk turning into
an orbit, a swing opening out to the line from hands taken across the set, a
path's first step from rest and its last into a stand, the courtesy turn's
four chord points a turn — over the hip's acceleration cap, to be fixed by
curved entries and a ramp in the scheduler, not by a bigger cap. And the
seating the language never re-commits after a chain: the robin who has
chained across drifts, by the check's lights, a set's width from the seat the
text still gives her (a G1 question beside the swing's).
