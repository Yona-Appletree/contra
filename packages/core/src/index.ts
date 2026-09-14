// @caller/core — the form-neutral time and kinematics layer. Knows nothing
// about dancing. See README.md for the contract these exports implement.

// kinematics
export type { ArmSolution, Arm3dSolution } from "./kinematics/Arm.js";
export { planarReach, solveArm, solveArm3d } from "./kinematics/Arm.js";
export type { Hand, PoseSample, Side, Style } from "./kinematics/PoseSample.js";
export { NEUTRAL_STYLE, lerpHand } from "./kinematics/PoseSample.js";
export { shoulders, shouldersAt } from "./kinematics/shoulders.js";
export type { HandStackRoleSet, JoinedHand } from "./kinematics/stackJoined.js";
export { stackJoined } from "./kinematics/stackJoined.js";
export { easeSeam, seamProgress } from "./kinematics/easeSeam.js";
export type { QuietMotion } from "./kinematics/quietMotion.js";
export {
  BUZZ_PIVOT_FOOT,
  BUZZ_STEPS_PER_BEAT,
  BUZZ_SWING_PX,
  BUZZ_TRAILING_FOOT,
  FOOT_REST_FORWARD_PX,
  FOOT_REST_LATERAL_PX,
  FULL_AMPLITUDE_SPEED,
  lerpFeet,
  quietMotion,
} from "./kinematics/quietMotion.js";

// the rendering contract numbers
export {
  ARM_REACH_PX,
  CM_PER_PX,
  FOOT_SWING_PX,
  FOREARM_PX,
  HOLD_SPACING_PX,
  LINE_OFFSET_PX,
  RENDERING_CONTRACT,
  SEAM_BEATS,
  SHOULDER_FORWARD_PX,
  SHOULDER_WIDTH_PX,
  TORSO_SWAY_DEG,
  UPPER_ARM_PX,
} from "./kinematics/RenderingContract.js";

// time
export type { Beat, Clock } from "./time/Clock.js";
export { DEFAULT_BPM, createClock } from "./time/Clock.js";
export type { Meter } from "./time/Meter.js";
export { REEL, beatInPhrase, beatsPerPhrase, phraseOf } from "./time/Meter.js";

// geometry
export type { Vec2 } from "./geometry/Vec2.js";
export {
  ZERO,
  add,
  addScaled,
  dist,
  dot,
  len,
  lerp,
  norm,
  rot,
  scale,
  sub,
  vec2,
} from "./geometry/Vec2.js";
export type { Angle } from "./geometry/Angle.js";
export {
  angleDiff,
  angleLerp,
  angleOf,
  angleOfVec,
  bodyPoint,
  dirOf,
  leftOf,
  rightOf,
} from "./geometry/Angle.js";
export { clamp01, mix, ramp, smooth } from "./geometry/smooth.js";
export { q256, q256Vec2 } from "./geometry/q256.js";

/** Package identity, kept from the M1 scaffold smoke test. */
export const packageName = "@caller/core";
