import { HOLD_SPACING_PX } from "@caller/core";
import { HEIGHTS } from "../body/Body.js";
import type { Hand, HoldId } from "../ir/Hold.js";
import type { Vec3 } from "../motion/Vec3.js";
import { free } from "./free.js";
import type { BodyFrame, Contact, HoldPosture } from "./HoldPosture.js";

/**
 * **Placeholder postures** for the holds Butter names at floor level. Each is
 * a plausible shared point at a plausible height with the user's standing
 * rulings applied ("elbow down, a tiny bit out": swivel 10°; the robin's hand
 * on top when hands stack), and nothing more: the user rules on every one of
 * these at the holds gallery (roadmap bite B), and until then they exist so
 * the scheduler can take and release them and the proof can run over them.
 */
const midpointAt = (self: BodyFrame, other: BodyFrame | undefined, hand: Hand, z: number): Vec3 => {
  if (!other) return free.target(self, undefined, hand);
  return { x: (self.hip.x + other.hip.x) / 2, y: (self.hip.y + other.hip.y) / 2, z };
};

const towardOther = (self: BodyFrame, other: BodyFrame | undefined, hand: Hand): Vec3 => {
  if (!other) return free.palmNormal(self, undefined, hand);
  const dx = other.hip.x - self.hip.x;
  const dy = other.hip.y - self.hip.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d, z: 0 };
};

const placeholder = (
  id: HoldId,
  hand: Hand | "either",
  contact: Contact,
  z: number,
  spacingPx: number,
): HoldPosture => ({
  id,
  hand,
  contact,
  ...(contact === "stacked" ? { onTop: "robin" as const } : {}),
  target: (self, other, h) => midpointAt(self, other, h, z),
  palmNormal: (self, other, h) =>
    contact === "stacked" ? { x: 0, y: 0, z: 1 } : towardOther(self, other, h),
  swivelDeg: 10,
  spacingPx,
});

/** Inside hands joined, a couple side by side: low, the robin's hand on top. */
export const couple = placeholder("couple", "either", "stacked", HEIGHTS.hipPx + 2, 14);
/** A ring: hands joined low between neighbours, "a smooth circle". */
export const ring = placeholder("ring", "either", "stacked", HEIGHTS.hipPx + 1, 14);
/** The swing: stands in for the ballroom hold with one shared point out front. */
export const ballroom = placeholder(
  "ballroom",
  "either",
  "palm",
  HEIGHTS.shoulderPx - 4,
  HOLD_SPACING_PX,
);
/** A long line: hands joined low at the side, a hand's width between shoulders. */
export const line = placeholder("line", "either", "stacked", HEIGHTS.hipPx, 14);
/** A pull by: right hands, waist height, palm to palm. */
export const pullByR = placeholder(
  "pull-by-R",
  "right",
  "palm",
  HEIGHTS.hipPx + 3,
  HOLD_SPACING_PX,
);
export const pullByL: HoldPosture = { ...pullByR, id: "pull-by-L", hand: "left" };
/** The courtesy turn: side by side, hands in front of the robin. */
export const courtesy = placeholder("courtesy", "either", "stacked", HEIGHTS.hipPx + 4, 14);
/**
 * A long wave: hands at shoulder height, palm to palm, midway between two
 * dancers a place apart who face opposite ways (M3, Robins on a Wire). Palm
 * to palm has no top; if the gallery makes it stacked, the rule written
 * down for it is that the dancer on the **right** of the wave (the one whose
 * left hand it is) stacks on top.
 */
export const wave = placeholder("wave", "either", "palm", HEIGHTS.shoulderPx - 3, 20);
/** A two-hand hold facing: both hands, waist-plus. */
export const twoHand = placeholder(
  "two-hand",
  "either",
  "stacked",
  HEIGHTS.hipPx + 3,
  HOLD_SPACING_PX,
);
