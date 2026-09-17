import { dirOf, leftOf, rightOf } from "@caller/core";
import { HEIGHTS } from "../body/Body.js";
import type { Hand } from "../ir/Hold.js";
import type { Vec3 } from "../motion/Vec3.js";
import type { BodyFrame, HoldPosture } from "./HoldPosture.js";

/**
 * The hand that is holding nothing: it hangs beside the thigh, palm turned in
 * toward the leg. Every other posture falls back to this one when the person
 * on the far end is not there, so `free` is also the answer to "a take with
 * nobody".
 */
export const free: HoldPosture = {
  id: "free",
  hand: "either",
  contact: "free",
  target: (self, _other, hand) => hangPoint(self, hand),
  palmNormal: (self, _other, hand) => {
    const lateral = lateralOf(self.yawDeg, hand);
    return { x: -lateral.x, y: -lateral.y, z: 0 };
  },
  swivelDeg: 0,
  spacingPx: 0,
};

/** How far out to the side of the hips a hanging hand sits, px. */
export const HANG_LATERAL_PX = 5.6;

/** How far forward of the hips a hanging hand sits, px. */
export const HANG_FORWARD_PX = 0.4;

/**
 * The height a hanging hand sits at, px above the floor: a shoulder less a
 * very nearly straight arm, so the elbow keeps a little bend.
 */
export const HANG_Z_PX = HEIGHTS.shoulderPx - 14.5;

/** Where `hand` hangs when it is holding nothing. */
export const hangPoint = (self: BodyFrame, hand: Hand): Vec3 => {
  const lateral = lateralOf(self.yawDeg, hand);
  const forward = dirOf(self.yawDeg);
  return {
    x: self.hip.x + lateral.x * HANG_LATERAL_PX + forward[0] * HANG_FORWARD_PX,
    y: self.hip.y + lateral.y * HANG_LATERAL_PX + forward[1] * HANG_FORWARD_PX,
    z: HANG_Z_PX,
  };
};

/**
 * The unit vector pointing out of `hand`'s own side of a body yawed `yawDeg`,
 * flat on the floor plane. The right is `yawDeg + 90°` — toward +y, because
 * screen y increases downward.
 */
export const lateralOf = (yawDeg: number, hand: Hand): Vec3 => {
  const v = hand === "right" ? rightOf(yawDeg) : leftOf(yawDeg);
  return { x: v[0], y: v[1], z: 0 };
};
