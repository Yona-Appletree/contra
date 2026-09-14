import type { Beat, Vec2 } from "@caller/core";
import { addScaled, dirOf, ramp } from "@caller/core";
import type { PairFrame, PairRole } from "../pair/PairFrame.js";
import { handDown, pairPlace, placeAngle } from "../pair/PairFrame.js";
import type { FigureDef } from "./FigureDef.js";
import type { PairPose, RolePose } from "./pairPose.js";
import { pairPose } from "./pairPose.js";
import { trapezoid } from "./trapezoid.js";

/** {@link doSiDo} takes no parameters. */
export type DoSiDoParams = Record<string, never>;

/** How far the circle bulges at the back-to-back point, in px. */
const SWELL_PX = 2.5;

/** The arm swing fades up at the start and out at the end, so a seam never jumps. */
const SWING_IN = 0.6;
const SWING_OUT = 0.6;

function doSiDoPair(frame: PairFrame, t: Beat): PairPose {
  const b = doSiDo.beats;
  const f = trapezoid(t, 0, 0.9, b - 0.9, b);
  const radius = frame.spacing / 2 + SWELL_PX * Math.sin(Math.PI * f);
  const handSwing = ramp(t, 0, SWING_IN) * (1 - ramp(t, b - SWING_OUT, b));

  const dancer = (role: PairRole): RolePose => {
    const th = placeAngle(frame, role) + 360 * f;
    const p: Vec2 = addScaled(frame.centre, dirOf(th), radius);
    // The facing never changes: a do-si-do keeps looking where it started.
    const facing = pairPlace(frame, role).facing;
    return {
      p,
      facing,
      hands: {
        L: handDown(p, facing, "L", t, handSwing),
        R: handDown(p, facing, "R", t, handSwing),
      },
    };
  };

  return pairPose(dancer("lark"), dancer("robin"));
}

/**
 * Do-si-do: pass right shoulders, round back to back, and return. Hands stay
 * down and neither body turns — only the head follows the partner round.
 */
export const doSiDo: FigureDef<DoSiDoParams> = {
  id: "do-si-do",
  call: "Do-si-do",
  lead: 4,
  beats: 8,
  params: [],
  defaults: {},
  sample: (frame, role, t) => doSiDoPair(frame, t)[role],
};
