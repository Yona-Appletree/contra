import type { Angle, ArmPair, Beat, Hand, PoseSample, Vec2 } from "@caller/core";
import { NEUTRAL_STYLE, drawnArms, q256Vec2, quietMotion } from "@caller/core";
import type { FrameDancer } from "../renderer/Frame.js";
import type { Person } from "./Person.js";
import { headLook } from "./headLook.js";

/**
 * One dancer resolved into the points that get drawn: the quantised body
 * position, the swayed torso angle, where the feet are, which way the head
 * actually turns, and both arms solved in three dimensions.
 *
 * This is the whole of the renderer's per-dancer maths, split out so the pair
 * page's rig view (M5) and the tests can see the same numbers the pixels came
 * from. The arms themselves — where a `'down'` hand hangs and which way the
 * elbow bows — are `@caller/core`'s {@link drawnArms}: a figure has to start
 * every take from the same rest the renderer draws, and the motion oracle has
 * to measure the same elbow, and neither of them may import a renderer.
 */
export interface DancerLayout {
  person: Person;
  pose: PoseSample;
  /** Body centre, quantised (and snapped to whole px when anti-aliasing is off). */
  p: Vec2;
  /** Facing plus the torso sway — the angle the body is drawn at. */
  torsoAngle: Angle;
  /** The sway alone, in degrees. */
  sway: number;
  /** Foot offsets in body-local px: `[forward, right]`. */
  feet: { L: Vec2; R: Vec2 };
  /** Absolute angle the head is drawn at, after the neck limit. */
  headAngle: Angle;
  /** The hands actually used, hanging hands filled in for `'down'`. */
  hands: { L: Hand; R: Hand };
  arms: ArmPair;
}

/**
 * Resolve one dancer for one beat.
 *
 * `snap` is the position quantiser: `q256Vec2` normally, whole-pixel rounding
 * when the renderer is in `aa: false` mode. It is applied to the body position
 * *before* the shoulders and arms are solved, so an arm never disagrees with
 * the body it hangs off.
 */
export function layoutDancer(
  dancer: FrameDancer,
  beat: Beat,
  snap: (v: Vec2) => Vec2 = q256Vec2,
): DancerLayout {
  const { person, pose } = dancer;
  const velocity = dancer.velocity ?? [0, 0];
  const motion = quietMotion(pose, beat, velocity, dancer.style ?? NEUTRAL_STYLE);
  const p = snap(q256Vec2(pose.p));
  const torsoAngle = pose.facing + motion.sway;

  // Shoulders follow the swaying torso, so the arms sway with the body; a
  // hanging hand is placed on the plain facing, as it was in the spike.
  const drawn = drawnArms(pose, beat, p, torsoAngle);

  return {
    person,
    pose,
    p,
    torsoAngle,
    sway: motion.sway,
    feet: motion.feet,
    headAngle: headLook(pose.facing, pose.look),
    hands: drawn.hands,
    arms: drawn.arms,
  };
}
