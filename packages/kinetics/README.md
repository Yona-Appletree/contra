# @caller/kinetics

Engine 3: a compiler from a dance program to proved motion. A program is
text; it compiles, through a figure language of timed constraints and a
per-dancer per-beat assembly, into continuous trajectories for every body
point, each under a physical cap with no discontinuities, proved once on the
executor rather than per figure. Vision and plan:
`Planning/contra/2026-09-16-2348-kinetics-model/` (`vision.md` D1–D17,
`plan.md`, `notes.md`).

## Allowed imports

`@caller/core` only, and of it only the geometry (`Vec2`, angles, `q256`,
`smooth`), the time layer (`Beat`, `DEFAULT_BPM`) and `RENDERING_CONTRACT`.
Never `core/src/kinematics/*` — the arm solver, the drawn arms, the planted
gait and the rest are what this engine replaces, and
`src/allowedImports.test.ts` fails on any of their names.

## Nothing imports this package

`scripts/check-deps.mjs` lists `kinetics` with `core` as its only edge and
lists it in no other package's allowed set, so an import from `apps/web` or
`packages/contra` fails `pnpm check:deps`. The engine reaches the app in a
later bite.

## The layers, and who owns each

| layer             | what it is                                                                                                                                                     | file                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| source            | the program text: `select` bindings, calls, `repeat`, `if` / `when` on a binding or the time through, definitions, `progress()`, `//` comments, quoted strings | `src/lang/parse.ts`, `ast.ts`              |
| compiled sequence | one script per dancer: calls with beats and this dancer's cast, bindings resolved by the dialect from their seat                                               | `src/lang/compile.ts`                      |
| figure IR         | a figure as timed constraints: `pre`, soft `post`, windows (orbit, walk, pass, pivot, walk-to-seat, stand, intrinsic), look rules, casts                       | `src/ir/Figure.ts`, `src/figures/*.ts`     |
| dialect           | who is on the floor and what the words mean: the pair, and contra lines (becket, duple improper) with selectors, hands four, a progression and one becket end  | `src/dialect/pair/`, `src/dialect/contra/` |
| schedule          | entry, body and exit per call, the exit back-chained from the next figure's `pre` onto this one's soft end; hand seams; nobody stands; elision                 | `src/schedule/schedule.ts`                 |
| assembly          | one slot per dancer per beat: step, pivot, hold, drop, lean, look, buzz, stand; the listing in a dancer's words                                                | `src/asm/*`                                |
| executor          | slots to continuous effector trajectories: hips and facing on a natural cubic spline, feet by cadence, hands on cosine ramps                                   | `src/executor/*`                           |
| solver            | joints from effectors: shoulders, two-bone arms with a hold's swivel, hand plates, a head solved toward a point                                                | `src/solver/*`, `src/holds/*`              |
| proof             | speed and acceleration under each point's cap, no jumps, at 16 samples a beat                                                                                  | `src/motion/prove.ts`                      |
| debugger          | every layer on one page, one bar through all of them                                                                                                           | `debugger/`                                |

## The caps

Physical constants in cm/s and cm/s², converted at the dance's tempo
(`px/beat = cm/s × 60/bpm ÷ 4`), never derived from any library
(`src/units/caps.ts`). At 112 bpm: hip 140 cm/s and 250 cm/s² (18.75
px/beat, 17.9 px/beat²); feet 300 / 1200; hands 220 / 900; shoulders and
head 170 / 350; elbows 200 / 800. Angular: yaw 400°/s, lean ±15° at 60°/s,
look ±70° at 300°/s. Assembly limits (`src/units/limits.ts`): a step ≤ 75 cm
(a warning above 60), a pivot ≤ 90° while stepping, a take ramps over
`TAKE_BEATS` = 2 (a hand pulled from a full hang in one beat breaks the
elbow's cap whatever the ramp; a cosine ramp keeps a 12 px take under the
hand's, a smoothstep does not).

## The seams

A hold the next figure needs and this one already has is **carried**; a take
whose hands are free during the previous figure's last beats **overlaps**
them; otherwise it costs an entry slot; a drop overlaps the next figure's
first beat when its `pre` needs no hands. A walk ramps (half a step to start
from standing, half to stop). An orbit **spirals out** over its last beats to
where the next figure starts, its rotation frozen unless the next figure
orbits too. A `free` orbit turns as many times as its rate allows and ends
where its `post` says (a swing: beside the partner, facing home, in the line).

## Running

```bash
pnpm --filter @caller/kinetics test
pnpm --filter @caller/kinetics dev     # the debugger, http://localhost:5177
pnpm --filter @caller/kinetics build   # dist/debugger/
```

## What is deliberately not here yet

The robins chain and the hey (a partner swing stands in for both in the
"Butter — tonight" preset); a buzz-step swing (the assembly has one step a
beat, so the swing walks); the holds gallery and approvals (every hold but
the free hang and the allemandes is a placeholder posture); the other becket
end (Q1); duple improper's progression; the two clock regimes; publishing the
debugger at `/spikes/`; the ADR. And the seams the tests pin rather than
hide: a straight entry walk turning into an orbit, a swing opening out to the
line from hands taken across the set — over the hip's acceleration cap, to
be fixed by curved entries in the scheduler, not by a bigger cap.
