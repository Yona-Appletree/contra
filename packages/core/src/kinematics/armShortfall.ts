import type { Vec2 } from "../geometry/Vec2.js";
import { q256Vec2 } from "../geometry/q256.js";
import type { Beat } from "../time/Clock.js";
import { drawnArms } from "./drawnArms.js";
import type { PoseSample, Style } from "./PoseSample.js";
import { NEUTRAL_STYLE } from "./PoseSample.js";
import { quietMotion } from "./quietMotion.js";

/** How far each arm falls short of its hand, in px. Zero is the AC1 invariant. */
export interface ReachCheck {
  L: number;
  R: number;
}

/**
 * The planar shortfall of both arms for one pose, solved exactly the way
 * `@caller/hall` solves it: the body position quantised, the shoulders hung off
 * the **swayed** torso, and a `'down'` hand resolved to where it hangs.
 *
 * Plan AC1 is `short === 0` for every dancer at every eighth of a beat, so
 * every figure's test runs this over its whole length. A non-zero result means
 * a hand has been put where the arm cannot reach it, which is the one thing
 * the model is not allowed to do.
 */
export function armShortfall(
  pose: PoseSample,
  beat: Beat,
  velocity: Vec2,
  style: Style = NEUTRAL_STYLE,
): ReachCheck {
  const motion = quietMotion(pose, beat, velocity, style);
  const drawn = drawnArms(pose, beat, q256Vec2(pose.p), pose.facing + motion.sway);
  return { L: drawn.arms[0].short, R: drawn.arms[1].short };
}
