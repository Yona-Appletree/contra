import type { Beat, Vec2 } from "@caller/core";
import { addScaled, dirOf, lerpFeet, lerpHand, mix, ramp, smooth } from "@caller/core";
import type { PairFrame, PairRole } from "../pair/PairFrame.js";
import {
  HOLD_DROP_PX,
  HOLD_LATERAL_PX,
  handDown,
  pairPlace,
  twoHandHold,
} from "../pair/PairFrame.js";
import type { FigureDef } from "./FigureDef.js";
import type { PairPose, RolePose } from "./pairPose.js";
import { REST_FEET, pairPose } from "./pairPose.js";

export interface BalanceParams {
  /**
   * How far the body rocks forward, in px. The back rock is
   * {@link BALANCE_BACK_RATIO} times this.
   *
   * The spike rocked 1.3 px forward and the heads crowded at gate 3; see
   * `packages/contra/README.md` for the numbers this default was chosen
   * against.
   */
  rock: number;
  /**
   * Take two hands over the first beat instead of starting with them held. A
   * balance that follows a do-si-do comes in with the hands down.
   */
  takeHands: boolean;
}

/** The back rock is a little longer than the forward one, as in the spike (1.4 : 1.3). */
export const BALANCE_BACK_RATIO = 1.4 / 1.3;

/** The most the torso and head lean, in px, however big the rock is. */
export const BALANCE_LEAN_CAP = 1.0;

/** At full forward rock the joined hands spread this much wider and drop this much lower. */
const HAND_SPREAD_PX = 2;
const HAND_DROP_PX = 3;

/** At full back rock they rise this much. */
const HAND_RISE_PX = 1;

/** Where the feet are planted, body-local, before the rock moves the body over them. */
const FOOT_BACK: Vec2 = [0.8, -2.0];
const FOOT_FORWARD_FROM = 2.5;
const FOOT_FORWARD_TO = 3.8;
const FOOT_FORWARD_LATERAL = 2.0;

/** The planted feet fade in and out again, so a seam is never a foot jump. */
const PLANT_IN = 0.4;
const PLANT_OUT = 0.4;

/**
 * The rock itself, −1 to 1: forward over the first beat and a bit, back over
 * the third, level again at the end. Ported beat for beat from the spike.
 */
export function balanceRock(t: Beat): number {
  if (t < 0.7) return smooth(t / 0.7);
  if (t < 1.7) return 1;
  if (t < 2.6) return 1 - 2 * smooth((t - 1.7) / 0.9);
  if (t < 3.5) return -1;
  return -1 + smooth((t - 3.5) / 0.5);
}

function balancePair(frame: PairFrame, t: Beat, params: BalanceParams): PairPose {
  const fwd = balanceRock(t);
  const ahead = Math.max(fwd, 0);
  const behind = Math.max(-fwd, 0);
  const off = params.rock * fwd * (fwd > 0 ? 1 : BALANCE_BACK_RATIO);
  const lean = Math.max(-BALANCE_LEAN_CAP, Math.min(BALANCE_LEAN_CAP, fwd));
  const stepIn = ramp(t, 0, 0.5);
  const take = params.takeHands ? ramp(t, 0, 0.9) : 1;
  const planted = ramp(t, 0, PLANT_IN) * (1 - ramp(t, 4 - PLANT_OUT, 4));

  // One pair of joined points, spread and dropped by the rock, shared by both.
  const hold = twoHandHold(
    frame,
    HOLD_LATERAL_PX + HAND_SPREAD_PX * ahead,
    HOLD_DROP_PX + HAND_DROP_PX * ahead - HAND_RISE_PX * behind,
  );

  const dancer = (role: PairRole): RolePose => {
    const place = pairPlace(frame, role);
    const p = addScaled(place.p, dirOf(place.facing), off);
    return {
      p,
      facing: place.facing,
      lean,
      feet: lerpFeet(
        REST_FEET,
        {
          L: [FOOT_BACK[0] - off, FOOT_BACK[1]],
          R: [mix(FOOT_FORWARD_FROM, FOOT_FORWARD_TO, stepIn) - off, FOOT_FORWARD_LATERAL],
        },
        planted,
      ),
      hands: {
        L: lerpHand(handDown(p, place.facing, "L", t, 0), role === "lark" ? hold.a : hold.b, take),
        R: lerpHand(handDown(p, place.facing, "R", t, 0), role === "lark" ? hold.b : hold.a, take),
      },
    };
  };

  return pairPose(dancer("lark"), dancer("robin"));
}

/**
 * Balance: rock forward and back over four beats with two hands joined. The
 * bodies move, the feet stay planted, and the joined hands spread and drop as
 * the pair comes together.
 */
export const balance: FigureDef<BalanceParams> = {
  id: "balance",
  call: "Balance",
  lead: 4,
  beats: 4,
  params: ["rock", "takeHands"],
  defaults: { rock: 1.0, takeHands: false },
  sample: (frame, role, t, params) => balancePair(frame, t, params)[role],
};
