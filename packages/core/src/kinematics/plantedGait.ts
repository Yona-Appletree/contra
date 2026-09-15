import type { Angle } from "../geometry/Angle.js";
import { bodyPoint, dirOf, rightOf } from "../geometry/Angle.js";
import { smooth } from "../geometry/smooth.js";
import type { Vec2 } from "../geometry/Vec2.js";
import type { Beat } from "../time/Clock.js";
import type { Side } from "./PoseSample.js";
import { FOOT_SWING_PX } from "./RenderingContract.js";
import { FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX } from "./quietMotion.js";

/**
 * **The planted gait** (M10, the move-motion gate's ruling 2b).
 *
 * A dancer's feet before M10 were a sine wave in the dancer's own frame: both
 * shoes slid forward and back under a body that was gliding across the floor,
 * which is a mannequin's walk and not a person's. A real foot **lands on its
 * count and stays where the floor is** while the body travels over it, and then
 * swings through to its next landing in the last half beat — arriving *ahead* of
 * where the body is about to be, which is what makes a step look like a step.
 *
 * So: the foot that lands at whole beat `k` is put down at
 * {@link plantAt}, held for {@link PLANT_HOLD_BEATS}, and swung over the
 * following {@link PLANT_SWING_BEATS} to the plant at `k + 2`. The feet
 * alternate, the **right** landing on even beats — which is count 1 of a phrase
 * and of every figure that starts on an even beat, and which is carried by the
 * *absolute* beat so that a three-beat figure simply hands the alternation on.
 *
 * ## D1: the band
 *
 * A foot cannot both stay nailed to the floor for a beat and a half and stay
 * inside the rendering contract's ±{@link FOOT_SWING_PX} px of its rest
 * position. Long lines walks about 3 px/beat and never leaves the band; a pass
 * through at 10.7 px/beat would leave the shoe 16 px behind the body, which is
 * outside the torso and five times the contract's number.
 *
 * The ruling (D1 (a)) is that **the contract wins**: the foot is fixed on the
 * floor only while it is inside the band, and past that it is dragged along at
 * the band's edge until its swing begins. At 3 px/beat the whole hold is a true
 * plant; at 8 px/beat the true plant lasts about 0.65 beat and the rest of the
 * hold is a drag. The number in `AGENTS.md` is unchanged — what changed is that
 * ±2.6 px is now *the band a planted foot may be from its rest*, and it is
 * enforced structurally here: every foot this module returns is clamped to it.
 */

/** A time-addressable body pose: where the dancer is and which way they point. */
export interface BodyPose {
  p: Vec2;
  facing: Angle;
}

/**
 * The body path the gait reads, in whatever beats the caller measures in
 * (`poseAt` uses absolute ones, so that a plant before a figure began is the
 * previous figure's business and the seam is continuous for free).
 *
 * It must answer for any `t` the caller can reach, including half a beat either
 * side of the beats it is asked about, and it must be **pure**: the gait calls
 * it several times per sample and memoises the answers.
 */
export type BodyPath = (t: Beat) => BodyPose;

/** How long a foot stays down after it lands, in beats. */
export const PLANT_HOLD_BEATS: Beat = 1.5;

/** How long it then spends swinging through to its next landing. */
export const PLANT_SWING_BEATS: Beat = 0.5;

/** The whole step cycle: one foot lands every beat, each foot every two. */
export const PLANT_CYCLE_BEATS: Beat = PLANT_HOLD_BEATS + PLANT_SWING_BEATS;

/** How far ahead of rest a foot may land. The landing is inside the band too. */
export const STRIDE_CAP_PX = FOOT_SWING_PX;

/**
 * D1 (a): how far from its rest position a foot may ever be, px.
 *
 * A named constant and not a literal so that comparing D1 (b) — exempting
 * planted feet from the band — against (a) is one edit and one re-cut of the
 * strips.
 */
export const PLANT_BAND_PX = FOOT_SWING_PX;

/** The landing lead as a fraction of the body's speed half a beat on. */
export const STRIDE_LEAD_FRACTION = 0.75;

/** The half-step the landing velocity is centrally differenced over. */
export const PLANT_VELOCITY_HALF_STEP: Beat = 1 / 32;

/** Below this the body counts as standing still and a foot lands on its rest. */
const STILL_PX_PER_BEAT = 1e-3;

/** Where one foot went down, and which one it was. */
export interface Plant {
  /** The whole beat it landed on. */
  beat: Beat;
  /** Where it landed, in world px. */
  p: Vec2;
  side: Side;
}

/** How a gait is parameterised; every field has the library's own default. */
export interface GaitOptions {
  /**
   * Whether the **right** foot lands on even beats. True for every figure in
   * the demo programme, whose events all start on even absolute beats; the flag
   * exists so a caller with a different convention has one, and so the parity
   * test has something to state.
   */
  rightOnEven?: boolean;
  /**
   * A memoised {@link plantAt}. Plants change only at whole beats, so a caller
   * sampling at 1/32 recomputes the same two plants thirty-two times over
   * without one. See {@link memoPlants}.
   */
  plants?: (k: number) => Plant;
}

/** Which foot lands on whole beat `k`. */
export function plantSide(k: number, rightOnEven = true): Side {
  const even = ((Math.round(k) % 2) + 2) % 2 === 0;
  return even === rightOnEven ? "R" : "L";
}

/** Where a foot rests, in world px, for a body in `pose`. */
export function footRest(pose: BodyPose, side: Side): Vec2 {
  return bodyPoint(
    pose.p,
    pose.facing,
    FOOT_REST_FORWARD_PX,
    side === "R" ? FOOT_REST_LATERAL_PX : -FOOT_REST_LATERAL_PX,
  );
}

/**
 * Where the foot that lands at whole beat `k` is put down, in world px.
 *
 * Its rest position at that instant, plus a **lead** along the direction the
 * body will be travelling half a beat later: the foot arrives where the body is
 * about to go, rather than under where the body already is. The lead is
 * `0.75 × speed`, capped at {@link STRIDE_CAP_PX} so the landing itself is
 * inside the band, and it is zero for a body that has stopped — which is what
 * makes a dancer coming to a hold put their feet down on their rest rather than
 * striding into the stillness.
 */
export function plantAt(body: BodyPath, k: number, options: GaitOptions = {}): Plant {
  const side = plantSide(k, options.rightOnEven ?? true);
  const pose = body(k);
  const rest = footRest(pose, side);
  const h = PLANT_VELOCITY_HALF_STEP;
  const before = body(k + 0.5 - h).p;
  const after = body(k + 0.5 + h).p;
  const v: Vec2 = [(after[0] - before[0]) / (2 * h), (after[1] - before[1]) / (2 * h)];
  const speed = Math.hypot(v[0], v[1]);
  const dir: Vec2 = speed > STILL_PX_PER_BEAT ? [v[0] / speed, v[1] / speed] : dirOf(pose.facing);
  const lead =
    speed > STILL_PX_PER_BEAT ? Math.min(STRIDE_CAP_PX, STRIDE_LEAD_FRACTION * speed) : 0;
  return { beat: k, side, p: [rest[0] + dir[0] * lead, rest[1] + dir[1] * lead] };
}

/** A {@link plantAt} that remembers, for a caller sampling one path many times. */
export function memoPlants(body: BodyPath, options: GaitOptions = {}): (k: number) => Plant {
  const seen = new Map<number, Plant>();
  return (k) => {
    const found = seen.get(k);
    if (found) return found;
    const made = plantAt(body, k, options);
    seen.set(k, made);
    return made;
  };
}

/**
 * Both feet at beat `t`, body-local `[forward, right]` from the body centre —
 * the same two vectors `PoseSample.feet` has always carried, so the renderer is
 * untouched.
 *
 * Each foot is at its last plant, dragged at the band's edge if the body has
 * carried it that far, or part way through its swing to the next one. The
 * result is clamped to {@link PLANT_BAND_PX} of rest unconditionally: that is
 * D1 (a) stated once, where it cannot be got round, rather than as a property
 * three separate branches have to be trusted to keep.
 */
export function plantedGait(
  body: BodyPath,
  t: Beat,
  options: GaitOptions = {},
): { L: Vec2; R: Vec2 } {
  const plants = options.plants ?? ((k: number) => plantAt(body, k, options));
  const rightOnEven = options.rightOnEven ?? true;
  const here = body(t);
  const forward = dirOf(here.facing);
  const right = rightOf(here.facing);

  /** The world point of the foot whose last landing was at whole beat `k`. */
  const footAt = (k: number): Vec2 => {
    const plant = plants(k);
    const u = t - k;
    if (u < PLANT_HOLD_BEATS) return plant.p;
    // The swing: from wherever the hold left it — the plant, or the band's edge
    // it had been dragged to — through to the next plant, which is exact.
    const held = clampToBand(plant.p, footRest(body(k + PLANT_HOLD_BEATS), plant.side));
    const next = plants(k + PLANT_CYCLE_BEATS).p;
    const s = smooth((u - PLANT_HOLD_BEATS) / PLANT_SWING_BEATS);
    return [held[0] + (next[0] - held[0]) * s, held[1] + (next[1] - held[1]) * s];
  };

  const last = Math.floor(t);
  const sideOfLast = plantSide(last, rightOnEven);
  const beats: Record<Side, number> = {
    L: sideOfLast === "L" ? last : last - 1,
    R: sideOfLast === "R" ? last : last - 1,
  };

  const local = (side: Side): Vec2 => {
    const rest = footRest(here, side);
    const world = clampToBand(footAt(beats[side]), rest);
    const dx = world[0] - here.p[0];
    const dy = world[1] - here.p[1];
    return [dx * forward[0] + dy * forward[1], dx * right[0] + dy * right[1]];
  };

  return { L: local("L"), R: local("R") };
}

/** `p`, or the nearest point to it inside the band about `rest`. */
function clampToBand(p: Vec2, rest: Vec2): Vec2 {
  const dx = p[0] - rest[0];
  const dy = p[1] - rest[1];
  const d = Math.hypot(dx, dy);
  if (d <= PLANT_BAND_PX) return p;
  const k = PLANT_BAND_PX / d;
  return [rest[0] + dx * k, rest[1] + dy * k];
}
