import { HOLD_SPACING_PX } from "@caller/core";
import { HEIGHTS } from "../body/Body.js";
import type { Hand } from "../ir/Hold.js";
import type { Vec3 } from "../motion/Vec3.js";
import { free } from "./free.js";
import type { BodyFrame, HoldPosture } from "./HoldPosture.js";

/**
 * Allemande right: palm to palm, thumbs up, the two hands at one point on the
 * line between the two hips, a little above the waist.
 *
 * The user's ruling, verbatim: **"elbow down, a tiny bit out"** — which is the
 * whole of the posture's shape. The hands are at `hip + 3 px` rather than at
 * shoulder height (that would be a wave, not an allemande), the plate is
 * vertical (so the thumbs point up without anything having to say so), and the
 * elbow is swivelled 10° outward off straight down.
 *
 * Both dancers compute the same midpoint from the same two hips, so the joined
 * hands are one shared point by arithmetic (the rendering contract).
 */
export const allemandeR: HoldPosture = {
  id: "allemande-R",
  hand: "right",
  contact: "palm",
  target: (self, other, hand) => allemandeTarget(self, other, hand),
  palmNormal: (self, other, hand) => allemandePalmNormal(self, other, hand),
  swivelDeg: 10,
  spacingPx: HOLD_SPACING_PX,
};

/** Allemande left: the same posture on the other side. */
export const allemandeL: HoldPosture = {
  ...allemandeR,
  id: "allemande-L",
  hand: "left",
};

/** "A tiny bit out": how far the elbow swivels outward off straight down, degrees. */
export const ALLEMANDE_SWIVEL_DEG = allemandeR.swivelDeg;

/** How far above the hips the joined hands sit, px. "Waist-plus". */
export const ALLEMANDE_RISE_PX = 3;

const allemandeTarget = (self: BodyFrame, other: BodyFrame | undefined, hand: Hand): Vec3 => {
  if (!other) return free.target(self, undefined, hand);
  return {
    x: (self.hip.x + other.hip.x) / 2,
    y: (self.hip.y + other.hip.y) / 2,
    z: HEIGHTS.hipPx + ALLEMANDE_RISE_PX,
  };
};

const allemandePalmNormal = (self: BodyFrame, other: BodyFrame | undefined, hand: Hand): Vec3 => {
  if (!other) return free.palmNormal(self, undefined, hand);
  // Toward the other dancer's hip, flat: a vertical plate, which is what puts
  // the thumbs up. The two dancers' normals are therefore exactly opposite —
  // the two palms press.
  const dx = other.hip.x - self.hip.x;
  const dy = other.hip.y - self.hip.y;
  const m = Math.hypot(dx, dy);
  if (m < 1e-9) return free.palmNormal(self, undefined, hand);
  return { x: dx / m, y: dy / m, z: 0 };
};
