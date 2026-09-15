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
function easeSeam(prev: PoseSample, next: PoseSample, k: number, beat?: Beat): PoseSample;
function seamProgress(t: number): number; // t / SEAM_BEATS, clamped
function quietMotion(sample: PoseSample, beat: Beat, velocity: Vec2, style?: Style): QuietMotion;
function lerpHand(a: Hand, b: Hand, k: number): Hand;
function lerpFeet(a: Feet, b: Feet, k: number): Feet;

// the resting arm and the drawn arm points — src/kinematics/drawnArms.ts
interface DrawnArms {
  shoulders: { L: Vec2; R: Vec2 };
  hands: { L: Hand; R: Hand }; // a 'down' hand filled in from the hang
  hanging: { L: boolean; R: boolean };
  arms: readonly [left: Arm3dSolution, right: Arm3dSolution];
}
function hangingHand(p: Vec2, facing: Angle, side: "L" | "R", beat: Beat, amp: number): Hand;
function elbowPole(shoulder: Vec2, hand: Hand, side: "L" | "R", facing: Angle): Vec2;
function resolveHand(pose: PoseSample, p: Vec2, side: "L" | "R", beat: Beat): Hand;
function drawnArms(pose: PoseSample, beat: Beat, p?: Vec2, torsoAngle?: Angle): DrawnArms;
const handDown = hangingHand; // the name a figure calls it by

// what a figure moves on — src/kinematics/trapezoid.ts, motionProfile.ts,
// plantedGait.ts, swingFeet.ts, armShortfall.ts
function trapezoid(t: number, a0: number, a1: number, b0: number, b1: number): number;
function trapezoidSpeed(t: number, a0: number, a1: number, b0: number, b1: number): number;

type MotionProfile = "smooth" | "cruise";
const CRUISE_RAMP_BEATS = 1;
function cruiseRamp(beats: Beat): Beat; // min(1, beats / 4)
function profileProgress(profile: MotionProfile, t: Beat, beats: Beat): number;
function profileSpeed(profile: MotionProfile, t: Beat, beats: Beat): number;
function peakOverAverage(profile: MotionProfile, beats: Beat): number;

type BodyPose = { p: Vec2; facing: Angle };
type BodyPath = (t: Beat) => BodyPose;
interface Plant {
  beat: Beat;
  p: Vec2;
  side: "L" | "R";
}
const PLANT_HOLD_BEATS = 1.5;
const PLANT_SWING_BEATS = 0.5;
const PLANT_CYCLE_BEATS = 2;
const PLANT_BAND_PX = FOOT_SWING_PX; // D1 (a)
const STRIDE_CAP_PX = FOOT_SWING_PX;
const STRIDE_LEAD_FRACTION = 0.75;
const PLANT_VELOCITY_HALF_STEP = 1 / 32;
function plantSide(k: number, rightOnEven?: boolean): "L" | "R";
function footRest(pose: BodyPose, side: "L" | "R"): Vec2;
function plantAt(body: BodyPath, k: number, options?: GaitOptions): Plant;
function memoPlants(body: BodyPath, options?: GaitOptions): (k: number) => Plant;
function plantedGait(body: BodyPath, t: Beat, options?: GaitOptions): { L: Vec2; R: Vec2 };

function swingFeet(t: Beat, facing: Angle, velocity: Vec2, buzz: number): { L: Vec2; R: Vec2 };
function armShortfall(
  pose: PoseSample,
  beat: Beat,
  velocity: Vec2,
  style?: Style,
): { L: number; R: number };
```

`stackJoined` takes the role set's `top` role, so `core` never mentions larks or
robins; the contra role set supplies `{ top: "robin" }`.

#### The resting arm

A figure says where a hand is when it places one and `'down'` when it does not,
so `PoseSample` only half answers "where is the arm". The other half is
`drawnArms.ts`, and it lives here rather than in the renderer because three
callers need the same answer: `@caller/hall` draws it, `@caller/contra` starts
every take and every release from it and may not import a renderer, and
`@caller/choreo`'s motion oracle has to measure the elbow that is actually
drawn — an elbow that crosses the body reads as a jump even when the hand
barely moves. F3a moved it down out of `@caller/hall`; every golden was
byte-identical afterwards.

A hand the figure leaves `'down'` hangs at `HAND_HANG_LATERAL_PX` (5.6 px — the
torso ellipse's own half-width, so the hand is beside the hip),
`HAND_HANG_FORWARD_PX` (0.4 px) forward and `HAND_HANG_DROP_PX` (14.5 px,
nearly the whole 15 px reach) down, swinging `HAND_HANG_SWING_PX` (0.6 px)
forward and back with the step. `elbowPole` then swings the elbow pole from
outward to backward as a hand comes to hang under its shoulder, over
`ELBOW_TUCK_PLANAR_PX` (4 px) of floor distance and `ELBOW_TUCK_DROP_PX` (6 px)
of drop, splaying `ELBOW_TUCK_SPLAY_DEG` (15°) to the dancer's own side: a
near-vertical arm cancels the pole's downward part, so the outward part would
otherwise be the whole of it and the elbow would wing out about 3 px past the
shoulder. The rule reads the hand's geometry, not whether the figure said
`'down'`, so a hand a figure places at the dancer's side draws the same as one
the renderer hangs there. All seven numbers were retuned at gate G1.

One more thing happens to the pole, and it is F3c's: the part of it that points
the way the **arm** already points is capped at `ELBOW_POLE_ALONG_FRACTION`
(half) of the amount that would cancel the elbow's downward bow, fading in over
`ELBOW_POLE_ALONG_PLANAR_PX` (2 px) of floor distance from the shoulder.
`solveArm3d` puts the elbow off the shoulder-hand line in the direction of the
pole, made perpendicular to that line; a pole pointing down and outward is
_parallel_ to an arm pointing down and outward at the same angle, almost nothing
survives the projection, and the elbow flips through 180° as the hand crosses
it. With `POLE_OUTWARD` at 0.55 that crossing is at 61° below horizontal,
squarely inside the arc a reaching arm sweeps through. F3a measured what it
cost — `long-lines` moving an elbow at 334 px/beat while its hand did 21, and an
elbow "bound" derived from an ordinary take that came out at an unusable 750
px/beat because the take crosses the same angle. With the cap the same take
moves the elbow at 68 px/beat, and every hand outside that wedge draws exactly
as it did before.

`drawnArms` takes `p` and `torsoAngle` separately because the renderer quantises
the body position before it solves anything and hangs the shoulders off the
_swaying_ torso, while a hanging hand is placed on the plain facing. Left to
default they are the pose's own, which is the figure's answer rather than the
renderer's.

#### What a figure moves on

Four more pieces sit here for the same reason the resting arm does: more than
one figure layer needs the identical answer, and a second copy of the numbers is
the only way two of them could ever disagree. None of them knows anything about
dancing.

`trapezoid` is the speed profile every travelling figure walks on — still until
`a0`, up to full speed by `a1`, full speed until `b0`, still again at `b1` —
returned as the normalised distance travelled, so a figure that ends where it
started uses it directly as a turn fraction. `trapezoidSpeed` is the same
profile's speed, which is what a skirt flares on.

`MotionProfile` is **how a leg of travel spends its beats** (M10). `smooth` is
the smoothstep every walking figure eased on before M10; `cruise` is the
constant-speed trapezoid, with ramps of `min(1 beat, leg / 4)`, which is what a
body walking _on_ the beat rather than easing through it looks like. Its
peak-over-average speed is 4/3 on any leg of four beats or fewer and 8/7 on an
eight-beat one, against the smoothstep's 3/2 at every length. `profileProgress`
guards both ends exactly — closure is 0.01 px and a seam is matched to the bit —
and `profileSpeed` is its analytic derivative, so a figure that has to hand a
dancer on at the right speed gets the number rather than a difference of it.
(`@caller/contra`'s `TimingProfile.profile` also admits `"trapezoid"`, which
names a figure's own **explicit** four-corner speed window; that is a different
thing and stays where it is.)

`plantedGait` is **the feet** (M10). A foot lands at a whole beat, stays where
the floor is for `PLANT_HOLD_BEATS` while the body travels over it, and swings
through to its next landing over `PLANT_SWING_BEATS`, arriving `0.75 × speed`
(capped at `STRIDE_CAP_PX`) ahead of the body's own rest position. The feet
alternate and the **right** lands on even beats, which is count 1 of a phrase;
parity is carried by the absolute beat, so a three-beat figure hands the
alternation on rather than restarting it. It takes a `BodyPath` — the body at
_other_ beats, not just the one being drawn — which is why it is a pure function
here fed by `@caller/choreo`'s `poseAt` rather than something a figure carries.

**D1 (a), the band.** A foot cannot both stay nailed down for a beat and a half
and stay inside `FOOT_SWING_PX` of its rest at the library's real walking speeds
(a pass through peaks at about 10.7 px/beat). The contract wins: a foot is fixed
on the floor only while it is inside `PLANT_BAND_PX` of rest and is dragged at
the band's edge past that. At 3 px/beat the whole hold is a true plant; at
8 px/beat the true plant lasts about 0.65 beat. Every foot the gait returns is
clamped, so the invariant is structural rather than a property three branches
have to be trusted to keep. `PLANT_BAND_PX` is a named constant so that
comparing D1 (b) — exempting planted feet — is one edit.

`swingFeet` cross-fades the walking feet into the buzz step's pivot-and-push,
because `buzz` is a boolean that replaces the feet outright and a swing has to
take the step up over the beat the hold takes. Since M10 its walking half is the
planted gait's, not a body-local sine.

`armShortfall` solves one pose's arms the way `@caller/hall` draws them — body
position quantised, shoulders hung off the _swaying_ torso, a `'down'` hand
resolved to where it hangs — and returns how far each arm falls short of its
hand. Plan AC1 is 0 for every dancer at every eighth of a beat, and every
figure's test in `@caller/contra` runs this over the figure's whole length.

`handDown` is `hangingHand` under the name the figures call it by.

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

`FOOT_SWING_PX` has not moved, but since M10 it means **the band a foot may be
from its rest position** rather than the amplitude of a swing along the
direction of travel: the planted gait plants inside it and drags at its edge.

## What was ported from `spikes/two-dancers/index.html`

Production code never imports from `spikes/`; these behaviours were read from
the spike and retyped.

| Here                                                                                  | Spike                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solveArm` / `solveArm3d`                                                             | `solveArm(S, H, drop, outward)`, the two-bone 3D IK with the down-and-outward pole and the `(L1 + L2) / d` clamp                                                                                                        |
| `planarReach`                                                                         | `reach = sqrt(max(0, (L1 + L2)² − hz²))`                                                                                                                                                                                |
| `shoulders`                                                                           | `bodyPt(P, torsoA, 0.3, ±SHW)` — but at 11 px, not the spike's 10.4; see the deviations below                                                                                                                           |
| `quietMotion`                                                                         | the `sampleAt` block: `vu`/`vw`, `ampS = min(1, speed / 4) × amp`, the buzz feet, `torsoA = a + 1.5·sn·ampS`. Its walking feet (`[2.5 ± 2.6·sn·vu·ampS, ∓2.0 ± 2.6·sn·vw·ampS]`) were **removed** by M10                |
| `easeSeam` / `seamProgress`                                                           | the `SEAM = 0.4` block: `w = smooth(t / SEAM)`, `mixHand`, `alerp` on facing, `lerp` on lean. F3c replaced the spike's switch for a `'down'` hand with an interpolation through where the hand hangs — hence the `beat` |
| `createClock`                                                                         | the `clock` object: `refBeat + (now − ref) × bpm / 60`, `pause`/`resume`/`setTempo`                                                                                                                                     |
| `smooth ramp clamp01 q256 dirOf leftOf rightOf bodyPoint angleOf angleDiff angleLerp` | the helper block at the top of the spike's script                                                                                                                                                                       |
| `stackJoined`                                                                         | "the robin's hand on top, the lark's underneath", stated in the spike header and drawn by `drawArms`'s `under` flag                                                                                                     |

### What was ported from `spikes/move-motion/index.html`

The same rule: read from the spike and retyped, never imported.

| Here                           | Spike                                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profileProgress("cruise", …)` | `legs(t, ramp)` and the pass-through's `trapezoid(t, 0, r, 4 − r, 4)` — one rule, `r = min(1, beats / 4)`, instead of a ramp each figure picked for itself                       |
| `plantAt`                      | `feetGait`'s plant: `rest(bodyAt(k)) + dir × lead`, `lead = min(cap, 0.75 × \|v(k + 0.5)\|)`, `dir = v(k + 0.5)/\|v\|` or the facing when still; `k % 2 === 0` is the right foot |
| `plantedGait`                  | `feetGait`'s hold and swing: hold for `u < 1.5`, then `smooth((u − 1.5) / 0.5)` to the plant two beats on                                                                        |

**One deviation, and it is D1.** The spike's stride cap bounds where a foot
_lands_; it does not bound where the body then carries it, so the spike's own
shoes leave the contract's band at every speed above about 3.5 px/beat. The
band clamp — a foot dragged at `PLANT_BAND_PX` rather than left behind — is
this layer's, not the spike's. The spike's `air = sin(πw)` size cue was not
ported: `feet` stays two body-local `Vec2`s and the renderer is untouched (Q6).

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
- **`solveArm3d` takes an optional floor-plane elbow pole** (F1, gate G1). The
  default is `outward × POLE_OUTWARD` and is unchanged; nothing in `core`
  passes one. A near-vertical arm cancels the pole's downward part, so whatever
  is left in the floor plane is the whole of it and the elbow swings all the way
  there — which is why `@caller/hall` has to be able to say "back, not out" for
  a hand that hangs. It is an argument rather than a rule here because where an
  elbow _looks_ right is the renderer's judgement, not the solver's.
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
