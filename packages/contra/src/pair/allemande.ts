import type { Angle, Beat, Hand, Side, Vec2 } from "@caller/core";
import { addScaled, angleLerp, dirOf, lerpHand, mix, ramp } from "@caller/core";
import type { PairFrame, PairRole } from "./PairFrame.js";
import { OPEN_PAIR_HALF_PX, centreHand, handDown, insideHand, norm360 } from "./PairFrame.js";
import type { FigureDef } from "./FigureDef.js";
import type { PairPose, RolePose } from "./pairPose.js";
import { pairPose } from "./pairPose.js";
import { trapezoid } from "./trapezoid.js";

export interface AllemandeParams {
  /** Which hand is given. */
  hand: Side;
  /** How far round: once, once and a half, or twice. */
  amount: number;
  /**
   * How many degrees each body turns toward the centre, on top of walking the
   * circle. An arm cannot take pressure in the plane of the torso, so the
   * dancers turn a little into the turn rather than walking a straight line
   * past each other. The gate-3 tuning; a parameter, not a constant.
   */
  inward: number;
  /**
   * Which way the dancers face on beat 0, before they turn to the partner.
   * `null` means across the pair's axis, which is where a swing leaves them.
   */
  startFacing: Angle | null;
}

/** How far out the dancers drift while turning, before closing back to the hold. */
export const TURN_RADIUS_PX = 9;

function allemandePair(frame: PairFrame, t: Beat, params: AllemandeParams): PairPose {
  const b = allemande.beats;
  const spin = params.hand === "L" ? -1 : 1;
  const f = trapezoid(t, 0.8, 1.8, b - 1.6, b - 0.6);
  const thLark = frame.axis + spin * 360 * params.amount * f;

  const out = ramp(t, 0, 1.3);
  const close = ramp(t, b - 1.1, b);
  const radius = mix(mix(OPEN_PAIR_HALF_PX, TURN_RADIUS_PX, out), frame.spacing / 2, close);

  const toPartner = ramp(t, 0.1, 0.9);
  const toTurn = ramp(t, 0.9, 1.9);
  const backToPartner = ramp(t, b - 1.2, b - 0.2);
  const take = ramp(t, 0.4, 1.3);
  const release = ramp(t, b - 0.9, b - 0.1);
  const letGo = ramp(t, 0, 0.8);

  const startFacing =
    params.startFacing === null ? norm360(frame.axis + 90) : norm360(params.startFacing);
  const join = centreHand(frame);
  const inside = insideHand(frame, startFacing);
  const other: Side = params.hand === "L" ? "R" : "L";

  const dancer = (role: PairRole): RolePose => {
    const th = role === "lark" ? thLark : thLark + 180;
    const p: Vec2 = addScaled(frame.centre, dirOf(th), radius);
    let facing = angleLerp(startFacing, th + 180, toPartner);
    facing = angleLerp(facing, th + spin * (90 + params.inward), toTurn);
    facing = angleLerp(facing, th + 180, backToPartner);

    // Coming out of a ballroom swing the lark's right and the robin's left are
    // the inside hands; whichever of them is the giving hand starts there.
    const startOf = (side: Side): Hand =>
      (role === "lark" ? side === "R" : side === "L") ? inside : handDown(p, facing, side, t, 0);

    const down = (side: Side): Hand => handDown(p, facing, side, t, 0);
    return {
      p,
      facing,
      hands: {
        [params.hand]: lerpHand(
          lerpHand(startOf(params.hand), join, take),
          down(params.hand),
          release,
        ),
        [other]: lerpHand(startOf(other), down(other), letGo),
      } as { L: Hand; R: Hand },
    };
  };

  return pairPose(dancer("lark"), dancer("robin"));
}

/**
 * Allemande: give one hand at the pair's centre and walk round it. The joined
 * hand is one floor point at the centre, held high; each body turns `inward`
 * degrees toward that centre rather than walking a straight line past the
 * partner, so the arm has something to pull against.
 */
export const allemande: FigureDef<AllemandeParams> = {
  id: "allemande",
  call: "Allemande",
  lead: 4,
  beats: 8,
  params: ["hand", "amount", "inward", "startFacing"],
  defaults: { hand: "L", amount: 1, inward: 20, startFacing: null },
  sample: (frame, role, t, params) => allemandePair(frame, t, params)[role],
};
