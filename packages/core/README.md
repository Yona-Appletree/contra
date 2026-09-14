# @caller/core

Form-neutral time and kinematics: the `Clock` that maps audio time to beats
and phrases, `PoseSample`, the arm solver, hand stacking, seam easing, quiet
motion, and per-dancer `Style`. Knows nothing about dancing, figures, or any
particular dance form.

## Allowed imports

`@caller/core` imports nothing from this workspace. It is the base of the
dependency graph (`core ← choreo ← contra`, `core ← hall`, `core ← music`).

No DOM: the package compiles with `lib: ["ES2023"]` only.

## Units

World pixels, 4 cm per px, in a true overhead view with y increasing toward the
bottom of the screen. Angles are degrees from +x toward +y, so a facing of 0°
points right and the dancer's left is −y. Positions are plain numbers here; the
renderer quantises them to 1/256 px with `q256`, this package never does.

## The contract

### Time — `src/time/`

```ts
type Beat = number;
interface Meter {
  beatsPerBar: number;
  barsPerPhrase: number;
} // REEL and JIG are 2, 8 — the dance count: a bar is 2 beats, a phrase is 8 bars (16 beats)
interface Clock {
  beat(): Beat;
  rebase(now: number, beat: Beat, bpm: number): void;
  setTempo(bpm: number): void;
  setBeat(beat: Beat): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  tempo(): number;
}
function createClock(now: () => number, bpm = DEFAULT_BPM): Clock;
function beatsPerPhrase(meter: Meter): number;
function phraseOf(meter: Meter, beat: Beat): number;
function beatInPhrase(meter: Meter, beat: Beat): Beat;
```

`beat()` is exactly `refBeat + (now() − ref) × bpm / 60` between rebases, which
is what lets `@caller/music` hand the clock `AudioContext.currentTime` and make
the tune the master clock (plan AC4).

### Geometry — `src/geometry/`

`Vec2` (`readonly [number, number]`) with `vec2 add sub scale addScaled dot len
dist norm lerp rot`; `Angle` (degrees) with `angleOf angleOfVec dirOf leftOf
rightOf angleDiff angleLerp bodyPoint`; `smooth clamp01 mix ramp`; `q256
q256Vec2`.

`angleDiff` and `angleLerp` always take the shortest arc. `smooth` is
smoothstep with its input clamped to `[0, 1]`.

### Kinematics — `src/kinematics/`

```ts
interface Hand {
  p: Vec2;
  drop: number;
} // floor point, px below shoulder height
interface PoseSample {
  p: Vec2;
  facing: Angle;
  look: Angle;
  lean: number;
  hands: { L: Hand | "down"; R: Hand | "down" };
  stepRate: number;
  buzz: boolean;
  flare: number;
  amp: number;
  feet?: { L: Vec2; R: Vec2 };
}
interface Style {
  bounce: number;
  lead: number;
  swingTightness: number;
} // NEUTRAL_STYLE = 1, 0, 1
interface ArmSolution {
  shoulder: Vec2;
  elbow: Vec2;
  hand: Vec2;
  short: number;
}
interface Arm3dSolution extends ArmSolution {
  elbowZ: number;
  handZ: number;
  reach: number;
}

function solveArm(shoulder: Vec2, hand: Hand, side: "L" | "R", facing: Angle): ArmSolution;
function solveArm3d(shoulder: Vec2, hand: Hand, side: "L" | "R", facing: Angle): Arm3dSolution;
function planarReach(drop: number): number; // sqrt(15² − drop²), floored at 0
function shoulders(sample: PoseSample, swayDeg?: number): { L: Vec2; R: Vec2 };
function shouldersAt(p: Vec2, facing: Angle): { L: Vec2; R: Vec2 };
function stackJoined(a: JoinedHand, b: JoinedHand, roleSet: { top: string }): [top, bottom];
function easeSeam(prev: PoseSample, next: PoseSample, k: number): PoseSample;
function seamProgress(t: number): number; // t / SEAM_BEATS, clamped
function quietMotion(sample: PoseSample, beat: Beat, velocity: Vec2, style?: Style): QuietMotion;
function lerpHand(a: Hand, b: Hand, k: number): Hand;
function lerpFeet(a: Feet, b: Feet, k: number): Feet;
```

`stackJoined` takes the role set's `top` role, so `core` never mentions larks or
robins; the contra role set supplies `{ top: "robin" }`.

### The rendering contract numbers

`RENDERING_CONTRACT` and the individual constants are the AC2/AC3 invariants
from `AGENTS.md`, asserted in `RenderingContract.test.ts`. Changing one is a
reversal (director rubric E-look), even by a pixel.

| Constant                               | Value    |
| -------------------------------------- | -------- |
| `UPPER_ARM_PX`, `FOREARM_PX`           | 7.5 each |
| `ARM_REACH_PX`                         | 15       |
| `SHOULDER_WIDTH_PX`                    | 11       |
| `HOLD_SPACING_PX`                      | 14       |
| `LINE_OFFSET_PX`                       | 18       |
| `CM_PER_PX`                            | 4        |
| `FOOT_SWING_PX`                        | 2.6      |
| `TORSO_SWAY_DEG`                       | 1.5      |
| `RENDERING_CONTRACT.verticalBouncePx`  | 0        |
| `RENDERING_CONTRACT.positionQuantumPx` | 1/256    |
| `SEAM_BEATS`                           | 0.4      |

`SHOULDER_FORWARD_PX` (0.3) is look parity ported from the spike, not an AC3
invariant.

## What was ported from `spikes/two-dancers/index.html`

Production code never imports from `spikes/`; these behaviours were read from
the spike and retyped.

| Here                                                                                  | Spike                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solveArm` / `solveArm3d`                                                             | `solveArm(S, H, drop, outward)`, the two-bone 3D IK with the down-and-outward pole and the `(L1 + L2) / d` clamp                                                     |
| `planarReach`                                                                         | `reach = sqrt(max(0, (L1 + L2)² − hz²))`                                                                                                                             |
| `shoulders`                                                                           | `bodyPt(P, torsoA, 0.3, ±SHW)` — but at 11 px, not the spike's 10.4; see the deviations below                                                                        |
| `quietMotion`                                                                         | the `sampleAt` block: `vu`/`vw`, `ampS = min(1, speed / 4) × amp`, `feet = [2.5 ± 2.6·sn·vu·ampS, ∓2.0 ± 2.6·sn·vw·ampS]`, the buzz feet, `torsoA = a + 1.5·sn·ampS` |
| `easeSeam` / `seamProgress`                                                           | the `SEAM = 0.4` block: `w = smooth(t / SEAM)`, `mixHand`, `alerp` on facing, `lerp` on lean                                                                         |
| `createClock`                                                                         | the `clock` object: `refBeat + (now − ref) × bpm / 60`, `pause`/`resume`/`setTempo`                                                                                  |
| `smooth ramp clamp01 q256 dirOf leftOf rightOf bodyPoint angleOf angleDiff angleLerp` | the helper block at the top of the spike's script                                                                                                                    |
| `stackJoined`                                                                         | "the robin's hand on top, the lark's underneath", stated in the spike header and drawn by `drawArms`'s `under` flag                                                  |

### Golden fixtures

`Arm.test.ts` pins three hand positions taken from the spike's own figures, with
the elbow positions its `solveArm` produces. They were computed by retyping the
spike's `solveArm`, `bodyPt`, `leftOf`, `rightOf` and `hang` into a throwaway
node script. The shoulder inputs use the spike's own half-width of 5.2 px, so
the fixtures test the solver and not this package's 11 px shoulder constant.

1. **hold-left** — `figWalkIn` at `take = 1`, spacing 14: shoulder
   `bodyPt([-7, 0], 0, 0.3, -5.2)`, hand `add([0, 0], leftOf(0), LAT = 4.5)` at
   `drop = HOLD_D = 5`. Elbow `(-6.081653545905, -8.555120676848)`,
   `short = 0`.
2. **hang-right** — `hang([-7, 0], 0, +1, ph, amp = 0)`: hand
   `bodyPt([-7, 0], 0, 0.4, 6.2)` at `drop = HANG_D = 14`, shoulder
   `bodyPt([-7, 0], 0, 0.3, 5.2)`. Elbow `(-6.690921591127, 8.338261385864)`,
   `short = 0`.
3. **overreach-left** — the same hold point while the dancer is still at the
   lines, `D0 = spacing + 18 = 32`: shoulder `bodyPt([-16, 0], 0, 0.3, -5.2)`.
   Elbow `(-8.560095036661, -4.881660288259)`, hand pulled back to
   `(-1.420190073323, -4.563320576518)`, `short = 1.491816152262`.

## Deviations from the spike, and why

- **Shoulders are 11 px apart, the spike's are 10.4.** The spike's `SHW = 5.2`
  contradicts its own header ("shoulders 11 px wide") and `AGENTS.md`. 11 px is
  the AC3 invariant, so that is what `shoulders` uses.
- **`solveArm` takes a plain `Vec2` shoulder.** The milestone brief writes
  `Vec2 & { z: 0 }`; that type cannot be produced by a tuple literal and `z` is
  never read, so the height-0 contract is documented instead of encoded.
- **`ArmSolution` is exactly the four declared fields.** `solveArm3d` returns
  the heights as well, because the bone-length invariant is only checkable in
  three dimensions and the renderer shades by hand and elbow height.
- **The degenerate branch is normalised.** When the hand is within 0.05 px of
  the shoulder the spike returns an elbow 7.517 px away; here the same
  down-and-outward direction is scaled to exactly 7.5 px, so the bone invariant
  holds in every branch.
- **`Style.bounce` is clamped to `[0, 1]`** where it scales the quiet motion, so
  the ±2.6 px and 1.5° invariants hold for every style. `lead` and
  `swingTightness` are carried for the figure layer; `core` does not read them.
- **`buzz` is a boolean**, as the brief's `PoseSample` declares. The spike used
  it as a 0-to-1 mix weight; `lerpFeet` is exported so a figure can still fade a
  buzz step in and out.
