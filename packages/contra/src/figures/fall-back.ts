import type { Beat, Vec2 } from "@caller/core";
import { addScaled, lerp, lerpHand, ramp, rightOf, smooth } from "@caller/core";
import type { PairFrame, PairRole } from "../pair/PairFrame.js";
import { handDown, pairLinePlace, pairPlace, twoHandHold } from "../pair/PairFrame.js";
import type { FigureDef } from "./FigureDef.js";
import type { PairPose, RolePose } from "./pairPose.js";
import { pairPose } from "./pairPose.js";

export interface FallBackParams {
  /**
   * Let the joined hands go over the first beat. False when the figure before
   * this one already released them — the sequence would otherwise snap the
   * hands back up to a hold to drop them again.
   */
  release: boolean;
}

/** Beats spent walking back to the lines. */
const RETREAT_BEATS = 2;

/** How far the bodies shift their weight once they are standing in the lines, in px. */
const LINE_SWAY_PX = 0.3;

/** The arm swing fades up at the start and out as the dancers settle. */
const SWING_IN = 0.4;
const SWING_OUT_FROM = 1.6;
const SWING_OUT_TO = 2.2;

function fallBackPair(frame: PairFrame, t: Beat, params: FallBackParams): PairPose {
  const b = fallBack.beats;
  const k = smooth(Math.min(t, RETREAT_BEATS) / RETREAT_BEATS);
  const quiet = 1 - ramp(t, SWING_OUT_FROM, SWING_OUT_TO);
  const handSwing = ramp(t, 0, SWING_IN) * quiet;
  const letGo = params.release ? ramp(t, 0, 1) : 1;
  // Standing in the lines, the weight shifts from foot to foot; it fades in
  // once they arrive and out again before the figure ends.
  const sway =
    ramp(t, RETREAT_BEATS, RETREAT_BEATS + 1) *
    (1 - ramp(t, b - 1, b)) *
    LINE_SWAY_PX *
    Math.sin(Math.PI * t);
  const hold = twoHandHold(frame);

  const dancer = (role: PairRole): RolePose => {
    const close = pairPlace(frame, role);
    const line = pairLinePlace(frame, role);
    const facing = close.facing;
    const p: Vec2 = addScaled(lerp(close.p, line.p, k), rightOf(facing), sway);
    return {
      p,
      facing,
      amp: quiet,
      hands: {
        L: lerpHand(
          role === "lark" ? hold.a : hold.b,
          handDown(p, facing, "L", t, handSwing),
          letGo,
        ),
        R: lerpHand(
          role === "lark" ? hold.b : hold.a,
          handDown(p, facing, "R", t, handSwing),
          letGo,
        ),
      },
    };
  };

  return pairPose(dancer("lark"), dancer("robin"));
}

/**
 * Fall back to the lines: let the hands go and walk back until the two lines
 * are `LINE_OFFSET_PX` further apart than a hold, then stand there.
 */
export const fallBack: FigureDef<FallBackParams> = {
  id: "fall-back",
  call: "Fall back to the lines",
  lead: 4,
  beats: 8,
  params: ["release"],
  defaults: { release: true },
  sample: (frame, role, t, params) => fallBackPair(frame, t, params)[role],
};
