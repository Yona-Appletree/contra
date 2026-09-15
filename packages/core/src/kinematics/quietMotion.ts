import { dirOf, rightOf } from "../geometry/Angle.js";
import { clamp01, mix } from "../geometry/smooth.js";
import type { Vec2 } from "../geometry/Vec2.js";
import { dot } from "../geometry/Vec2.js";
import type { PoseSample, Style } from "./PoseSample.js";
import { NEUTRAL_STYLE } from "./PoseSample.js";
import { TORSO_SWAY_DEG } from "./RenderingContract.js";

/**
 * What the beat does to a dancer who is not doing anything else. Contra
 * glides, so the beat shows as a small foot and shoulder motion and never as a
 * vertical bounce (plan AC2).
 */
export interface QuietMotion {
  /** Foot offsets in body-local px: `[forward, right]` from the body centre. */
  feet: { L: Vec2; R: Vec2 };
  /** Torso sway to add to `facing`, in degrees. */
  sway: number;
}

/** Where the feet sit with no motion at all: `[forward, right]` from the centre. */
export const FOOT_REST_FORWARD_PX = 2.5;
export const FOOT_REST_LATERAL_PX = 2.0;

/**
 * Speed, in px per beat, at which the quiet motion reaches full amplitude.
 *
 * Since M10 this scales the **sway** only: the walking foot swing is gone from
 * here and the feet are the figure's own or the timeline's planted gait (see
 * `plantedGait.ts`). The buzz step, which is a foot motion and not a walk, still
 * reads it through `swingFeet`.
 */
export const FULL_AMPLITUDE_SPEED = 4;

/** Where the feet sit with no figure and no gait to say otherwise. */
export const FOOT_REST_L: Vec2 = [FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX];
export const FOOT_REST_R: Vec2 = [FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX];

/** Buzz step: the pivot foot's swing amplitude and the trailing foot's rest. */
export const BUZZ_SWING_PX = 1.8;
export const BUZZ_PIVOT_FOOT: Vec2 = [1.5, -3.0];
export const BUZZ_TRAILING_FOOT: Vec2 = [2.6, 2.3];

/**
 * Buzz steps per beat. Ported as an absolute rate from the two-dancers spike
 * (`Math.sin(TAU * 2 * b)`), which is twice the walking step rate of 1.
 */
export const BUZZ_STEPS_PER_BEAT = 2;

/** Below this speed the dancer counts as standing still. */
const STILL_PX_PER_BEAT = 1e-3;

const TAU = Math.PI * 2;

/**
 * Torso sway — and whatever the feet were told to do — for one dancer at one beat.
 *
 * The torso sways ±{@link TORSO_SWAY_DEG}°, scaled by how fast the dancer is
 * moving, by the sample's `amp`, and by the style's `bounce`. A dancer standing
 * still has no sway. Nothing here moves vertically.
 *
 * **The feet are not this function's any more** (M10). Before it, a walking
 * dancer's shoes slid forward and back in the dancer's *own* frame while the
 * body glided over the floor, which is a mannequin's walk. The feet now come
 * from the figure that placed them or, for every dancer whose figure left them
 * undefined, from the timeline's planted gait (`plantedGait.ts`), which lands
 * each foot on the floor and holds it there. What is left here is the rest
 * position, which is what a sample with nothing to say gets, and the buzz step,
 * which is a figure's own foot motion rather than a walk.
 *
 * A sample that carries explicit `feet` keeps them, exactly as before.
 *
 * @param sample the dancer's pose
 * @param beat absolute beat, which is what the step phase is measured against
 * @param velocity floor velocity in px per beat
 * @param style per-dancer variation; `bounce` is clamped to `[0, 1]`
 */
export function quietMotion(
  sample: PoseSample,
  beat: number,
  velocity: Vec2,
  style: Style = NEUTRAL_STYLE,
): QuietMotion {
  const forward = dirOf(sample.facing);
  const right = rightOf(sample.facing);
  const speed = Math.hypot(velocity[0], velocity[1]);
  const moving = speed > STILL_PX_PER_BEAT;
  // The direction of travel, resolved into the dancer's own axes.
  const vu = moving ? dot(velocity, forward) / speed : 1;
  const vw = moving ? dot(velocity, right) / speed : 0;

  const amplitude =
    Math.min(1, speed / FULL_AMPLITUDE_SPEED) * clamp01(sample.amp) * clamp01(style.bounce);
  const phase = beat * sample.stepRate;
  const sn = Math.sin(TAU * phase);

  let feet: { L: Vec2; R: Vec2 } = sample.feet ?? { L: FOOT_REST_L, R: FOOT_REST_R };

  if (sample.buzz) {
    const bz = Math.sin(TAU * BUZZ_STEPS_PER_BEAT * beat);
    feet = {
      L: [
        BUZZ_PIVOT_FOOT[0] + BUZZ_SWING_PX * bz * vu,
        BUZZ_PIVOT_FOOT[1] + BUZZ_SWING_PX * bz * vw,
      ],
      R: BUZZ_TRAILING_FOOT,
    };
  }

  return { feet, sway: sample.buzz ? 0 : TORSO_SWAY_DEG * sn * amplitude };
}

/** Blend two foot pairs, for figures that take a buzz step up or let it go. */
export const lerpFeet = (
  a: { L: Vec2; R: Vec2 },
  b: { L: Vec2; R: Vec2 },
  k: number,
): { L: Vec2; R: Vec2 } => ({
  L: [mix(a.L[0], b.L[0], k), mix(a.L[1], b.L[1], k)],
  R: [mix(a.R[0], b.R[0], k), mix(a.R[1], b.R[1], k)],
});
