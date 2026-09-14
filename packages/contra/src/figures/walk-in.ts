import type { Beat } from "@caller/core";
import { lerp, lerpHand, ramp, smooth } from "@caller/core";
import type { PairFrame, PairRole } from "../pair/PairFrame.js";
import { handDown, pairLinePlace, pairPlace, twoHandHold } from "../pair/PairFrame.js";
import type { FigureDef } from "./FigureDef.js";
import type { PairPose, RolePose } from "./pairPose.js";
import { pairPose } from "./pairPose.js";

/** {@link walkIn} takes no parameters. */
export type WalkInParams = Record<string, never>;

/** Beats spent walking from the lines in to the hold. */
const APPROACH_BEATS = 2;

/** The take: hands rise from the sides to the hold over the last beat and a bit. */
const TAKE_FROM = 2;
const TAKE_TO = 3.2;

/** The arm swing fades up at the start and out as the hands go up. */
const SWING_IN = 0.4;
const SWING_OUT_FROM = 1.6;
const SWING_OUT_TO = 2.2;

function walkInPair(frame: PairFrame, t: Beat): PairPose {
  const k = smooth(Math.min(t, APPROACH_BEATS) / APPROACH_BEATS);
  const take = ramp(t, TAKE_FROM, TAKE_TO);
  const quiet = 1 - ramp(t, SWING_OUT_FROM, SWING_OUT_TO);
  const handSwing = ramp(t, 0, SWING_IN) * quiet;
  const hold = twoHandHold(frame);

  const dancer = (role: PairRole): RolePose => {
    const line = pairLinePlace(frame, role);
    const close = pairPlace(frame, role);
    const p = lerp(line.p, close.p, k);
    const facing = close.facing;
    return {
      p,
      facing,
      amp: quiet,
      hands: {
        L: lerpHand(handDown(p, facing, "L", t, handSwing), role === "lark" ? hold.a : hold.b, take),
        R: lerpHand(handDown(p, facing, "R", t, handSwing), role === "lark" ? hold.b : hold.a, take),
      },
    };
  };

  return pairPose(dancer("lark"), dancer("robin"));
}

/**
 * Walk in from the lines and take two hands. The dancers start
 * `LINE_OFFSET_PX` further apart than the hold, arrive on beat 2, and the take
 * itself is animated: the hands rise from the sides to the two joined points
 * over the last beat rather than snapping.
 */
export const walkIn: FigureDef<WalkInParams> = {
  id: "walk-in",
  call: "Walk in and take two hands",
  lead: 4,
  beats: 4,
  params: [],
  defaults: {},
  sample: (frame, role, t) => walkInPair(frame, t)[role],
};
