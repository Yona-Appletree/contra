import type { Angle, Beat, PoseSample, Vec2 } from "@caller/core";
import {
  BUZZ_STEPS_PER_BEAT,
  SHOULDER_FORWARD_PX,
  SHOULDER_WIDTH_PX,
  addScaled,
  angleLerp,
  bodyPoint,
  dirOf,
  leftOf,
  lerp,
  lerpHand,
  ramp,
  rightOf,
  swingFeet,
} from "@caller/core";
import type { PairFrame, PairRole } from "./PairFrame.js";
import {
  HOLD_DROP_PX,
  HOLD_LATERAL_PX,
  OPEN_PAIR_HALF_PX,
  handDown,
  insideHand,
  norm360,
} from "./PairFrame.js";
import type { FigureDef } from "./FigureDef.js";
import { SAMPLE_DT } from "./FigureDef.js";
import type { PairPose, RolePose } from "./pairPose.js";
import { pairPose } from "./pairPose.js";
import { trapezoid, trapezoidSpeed } from "./trapezoid.js";

export interface SwingParams {
  /** How many times round, in whole and half turns. */
  turns: number;
  /**
   * How far the outstretched joined hands sit sideways from the midpoint of
   * the two joined shoulders, in px. The gate-3 tuning, which pulled the hands
   * in toward the pair; a parameter, not a constant.
   */
  handOffset: number;
  /**
   * How long the swing lasts. A contra swing is 8 or 12 beats and the number of
   * turns does not decide it, so it is a parameter.
   */
  beats: Beat;
  /**
   * Which way the pair faces when the swing opens out, with the lark on the
   * left. `null` takes it from the frame and the turns: the direction the pair
   * happens to be lined up on when the turning stops.
   */
  endFacing: Angle | null;
}

/** How far each dancer stands from the centre while turning. */
export const SWING_RADIUS_PX = 5;

/** How far each dancer sits to the side of the turning axis — the ballroom offset. */
export const SWING_LATERAL_PX = 3.5;

/** How far each body turns out of the line of the turn as the hold is taken. */
export const SWING_BODY_TURN_DEG = 30;

/** The outstretched joined hands sit just below shoulder height. */
export const SWING_HAND_DROP_PX = 1;

/** The free hand on the partner's back: body-local forward, right, and drop. */
export const BACK_HAND_FORWARD_PX = -1.5;
export const BACK_HAND_RIGHT_PX = -2.5;
export const BACK_HAND_DROP_PX = 1;

/** The other free hand, on the partner's shoulder. */
export const SHOULDER_HAND_INSET_PX = 0.5;

/** How far the bodies lean into the turn, in px. */
export const SWING_LEAN_PX = 0.6;

/** Extra skirt radius at full turning speed, in px. */
export const SWING_FLARE_PX = 2.6;

// The buzz-step feet are `@caller/core`'s, because the library's swing in
// `../figures/` has to put them in exactly the same place as this one. They are
// re-exported here under the name both swings already import.
export { swingFeet };

interface Places {
  lark: { p: Vec2; facing: Angle };
  robin: { p: Vec2; facing: Angle };
  psi: Angle;
  into: number;
  open: number;
}

/** Where the two bodies are and which way they point, `t` beats in. */
function swingPlaces(frame: PairFrame, t: Beat, params: SwingParams): Places {
  const b = params.beats;
  const psi0 = frame.axis + 180;
  const f = trapezoid(t, 0, 1.2, b - 1.6, b - 0.3);
  const psi = psi0 + 360 * params.turns * f;
  const into = ramp(t, 0, 1);
  const open = ramp(t, b - 1.4, b);
  const endFacing = swingEndFacing(frame, params);

  const dp = dirOf(psi);
  const lp = leftOf(psi);
  const larkTurn = addScaled(addScaled(frame.centre, dp, -SWING_RADIUS_PX), lp, SWING_LATERAL_PX);
  const robinTurn = addScaled(addScaled(frame.centre, dp, SWING_RADIUS_PX), lp, -SWING_LATERAL_PX);
  const larkHold = addScaled(frame.centre, dp, -frame.spacing / 2);
  const robinHold = addScaled(frame.centre, dp, frame.spacing / 2);
  const larkEnd = addScaled(frame.centre, leftOf(endFacing), OPEN_PAIR_HALF_PX);
  const robinEnd = addScaled(frame.centre, rightOf(endFacing), OPEN_PAIR_HALF_PX);

  return {
    lark: {
      p: lerp(lerp(larkHold, larkTurn, into), larkEnd, open),
      facing: angleLerp(psi - SWING_BODY_TURN_DEG * into, endFacing, open),
    },
    robin: {
      p: lerp(lerp(robinHold, robinTurn, into), robinEnd, open),
      facing: angleLerp(psi + 180 - SWING_BODY_TURN_DEG * into, endFacing, open),
    },
    psi,
    into,
    open,
  };
}

/**
 * Which way the pair faces when the swing opens out. Given, or the line the
 * turn stops on: the lark ends on the left of it and the robin on the right,
 * which is how a contra swing ends.
 */
export function swingEndFacing(frame: PairFrame, params: SwingParams): Angle {
  if (params.endFacing !== null) return params.endFacing;
  return norm360(frame.axis + 180 + 360 * params.turns - 90);
}

function swingPair(frame: PairFrame, t: Beat, params: SwingParams): PairPose {
  const b = params.beats;
  const now = swingPlaces(frame, t, params);
  const ahead = swingPlaces(frame, Math.min(t + SAMPLE_DT, b), params);
  const dt = Math.min(t + SAMPLE_DT, b) - t;
  const spd = trapezoidSpeed(t, 0, 1.2, b - 1.6, b - 0.3);
  const buzz = now.into * (1 - now.open);
  const inside = insideHand(frame, swingEndFacing(frame, params));

  const lp = leftOf(now.psi);
  const larkShoulder = bodyPoint(
    now.lark.p,
    now.lark.facing,
    SHOULDER_FORWARD_PX,
    -SHOULDER_WIDTH_PX / 2,
  );
  const robinShoulder = bodyPoint(
    now.robin.p,
    now.robin.facing,
    SHOULDER_FORWARD_PX,
    SHOULDER_WIDTH_PX / 2,
  );

  // The outstretched pair of hands: one point, taken from the two-hand hold
  // into the swing hold and let down again as the swing opens.
  const outHold = { p: addScaled(frame.centre, lp, HOLD_LATERAL_PX), drop: HOLD_DROP_PX };
  const outSwing = {
    p: addScaled(lerp(larkShoulder, robinShoulder, 0.5), lp, params.handOffset),
    drop: SWING_HAND_DROP_PX,
  };
  const out = lerpHand(outHold, outSwing, now.into);

  // The other pair: the lark's right on the robin's back, the robin's left on
  // the lark's shoulder. They are two points, not one, so they never join.
  const innerHold = { p: addScaled(frame.centre, lp, -HOLD_LATERAL_PX), drop: HOLD_DROP_PX };
  const larkBackHand = {
    p: bodyPoint(now.robin.p, now.robin.facing, BACK_HAND_FORWARD_PX, BACK_HAND_RIGHT_PX),
    drop: BACK_HAND_DROP_PX,
  };
  const robinShoulderHand = {
    p: bodyPoint(now.lark.p, now.lark.facing, 0, SHOULDER_WIDTH_PX / 2 - SHOULDER_HAND_INSET_PX),
    drop: 0,
  };

  const dancer = (role: PairRole): RolePose => {
    const here = now[role];
    const next = ahead[role];
    const velocity: Vec2 =
      dt <= 0 ? [0, 0] : [(next.p[0] - here.p[0]) / dt, (next.p[1] - here.p[1]) / dt];
    const free =
      role === "lark"
        ? lerpHand(lerpHand(innerHold, larkBackHand, now.into), inside, now.open)
        : lerpHand(lerpHand(innerHold, robinShoulderHand, now.into), inside, now.open);
    const joined = lerpHand(
      out,
      handDown(here.p, here.facing, role === "lark" ? "L" : "R", t, 0),
      now.open,
    );
    return {
      p: here.p,
      facing: here.facing,
      lean: -SWING_LEAN_PX * buzz,
      stepRate: BUZZ_STEPS_PER_BEAT,
      flare: SWING_FLARE_PX * spd,
      // The quiet motion's sway fades out as the buzz step comes in; the feet
      // are this figure's own, because a buzz step is not a walk.
      amp: 1 - buzz,
      feet: swingFeet(t, here.facing, velocity, buzz),
      hands: role === "lark" ? { L: joined, R: free } : { L: free, R: joined },
    };
  };

  return pairPose(dancer("lark"), dancer("robin"));
}

/**
 * Swing: take a ballroom hold, buzz round, and open out with the lark on the
 * left and the robin on the right. The outstretched joined hands are one floor
 * point `handOffset` px in from the midpoint of the joined shoulders; the other
 * two hands are on the partner's back and shoulder and never join.
 */
export const swing: FigureDef<SwingParams> = {
  id: "swing",
  call: "Swing",
  lead: 4,
  beats: 8,
  params: ["turns", "handOffset", "beats", "endFacing"],
  defaults: { turns: 2, handOffset: 5, beats: 8, endFacing: null },
  beatsOf: (params) => params.beats,
  sample: (frame, role, t, params): PoseSample => swingPair(frame, t, params)[role],
};
