import type { Angle, Beat, Hand, Vec2 } from "@caller/core";
import {
  ARM_REACH_PX,
  SHOULDER_WIDTH_PX,
  bodyPoint,
  dist,
  mix,
  ramp,
  rightOf,
  smooth,
  sub,
} from "@caller/core";
import type { RoleName, RoleSet, StationId } from "@caller/choreo";
import type { Spot } from "./ContraFigure.js";
import { bearing, midpoint, orbitRadius, polar } from "./ContraFigure.js";
import { BACK_HAND_DROP_PX, BACK_HAND_FORWARD_PX } from "../pair/swing.js";

/**
 * The courtesy turn: the couple stands side by side facing **out**, robin on
 * the lark's right, and **pivots as one rigid body through 180° about the point
 * between them**, ending facing **in** with the robin still on his right.
 *
 * The user, who is the authority on what this figure is:
 *
 * > "robins pull-by, take left hands with the lark, robin right hand goes
 * > behind the back, lark right hand goes on it, then they pivot around the
 * > center point (both walking, lark backwards, robin forwards) to put the
 * > robin back on the right. the arm basically stay put during the move."
 *
 * Three things follow from "rigid", and this file exists so that all three are
 * true by construction rather than by a figure's arithmetic agreeing:
 *
 * - **The bodies and the line turn together.** {@link CourtesyTurn.bodyTurn}
 *   and {@link CourtesyTurn.sweep} are the same number, ±180°, because a rigid
 *   body has one angular velocity. `bearing(lark, robin) − larkFacing` is which
 *   of his sides she is on and it changes by `sweep − bodyTurn`, so she is on
 *   his right at every instant of the turn and not only at the ends.
 * - **The hands stay put.** Two bodies whose relative pose never changes carry
 *   every point they hold with them: the joined left hands and the two right
 *   hands at her back keep the same body-local offsets for the whole rotation
 *   ("the arms basically stay put"). Nothing here interpolates a hand.
 * - **Which way round is not a choice.** She must walk forward and he backward,
 *   and for a rigid pair with her on his right that is one sign and one only:
 *   see {@link COURTESY_HALF_TURN}.
 *
 * **Where the couple stands when the hands close is not a choice either.** A
 * rigid half turn about the point between them is its own inverse, so the take
 * is the end reflected through the pivot: he stands on her side of the pivot
 * and she on his, one {@link CourtesyTurnSpec.hold} apart. A figure hands this
 * function the two *end* places and is told, in {@link CourtesyTurn.takes},
 * where it has to walk its two dancers first. In a chain that means the lark
 * steps across the middle of the set to meet her and wheels back out of it —
 * which is the price of a hall whose two lines stand further apart than a
 * couple holds, and is written up in the report for F7.
 */
export const COURTESY_HALF_TURN = -180;

/** The turn, planned: where it takes the couple from, and where it puts them. */
export interface CourtesyTurn {
  /** Where the two of them stand, and face, when the hands close. */
  takes: { lark: Spot; robin: Spot };
  /** Where the lark is `t` beats into the turn. */
  lark(t: Beat): Spot;
  /** Where the robin is `t` beats into the turn. */
  robin(t: Beat): Spot;
  /** How far each body turns, signed degrees: {@link COURTESY_HALF_TURN}. */
  bodyTurn: number;
  /** How far the couple's own line sweeps: the same number, the pair is rigid. */
  sweep: number;
  /** How far apart the couple turns, px. */
  hold: number;
  /** The point between them, which the whole turn happens about. */
  pivot: Vec2;
  /** How long the rigid rotation lasts; the rest of the figure opens out. */
  turnBeats: Beat;
}

/** What a figure hands {@link courtesyTurn}. */
export interface CourtesyTurnSpec {
  /** Where the turn leaves the lark: his place, facing in. */
  lark: Spot;
  /** Where the turn leaves the robin: beside him on his right, facing in. */
  robin: Spot;
  /**
   * How far apart the couple turns, px; see {@link courtesyHold}. Never more
   * than the two end places are apart.
   */
  hold: number;
  /** How long the whole turn takes. */
  beats: Beat;
  /**
   * How long the opening out on to the two places takes, at the end.
   *
   * The couple turns at the hold and ends on places that can be a whole set
   * apart — 32 px in duple improper against an 11.5 px hold — so the opening
   * out has to happen somewhere. It happens **after** the rotation, over this
   * many beats, which is also when the hands let go: joined hands on a couple
   * that has already opened out are further apart than two arms reach, and a
   * couple still opening out is not a rigid body.
   */
  openBeats: Beat;
}

/**
 * The couple's rigid half turn, and the opening out on to the two places.
 *
 * Both dancers are placed from the same three numbers — the pivot, the axis and
 * the separation — so the two of them are one couple at every instant and their
 * joined hands are one point by construction rather than by agreement.
 */
export function courtesyTurn(spec: CourtesyTurnSpec): CourtesyTurn {
  const pivot = midpoint(spec.lark.p, spec.robin.p);
  const sepTo = dist(spec.lark.p, spec.robin.p);
  const hold = Math.min(spec.hold, sepTo);
  const axisTo = bearing(spec.lark.p, spec.robin.p);
  const axisFrom = axisTo - COURTESY_HALF_TURN;
  const turnBeats = Math.max(0, spec.beats - Math.min(Math.max(spec.openBeats, 0), spec.beats));

  const at = (t: Beat, from: Angle, end: Spot): Spot => {
    const k = turnBeats <= 0 ? 1 : smooth(t / turnBeats);
    const open = ramp(t, turnBeats, spec.beats);
    return {
      p: polar(pivot, from + COURTESY_HALF_TURN * k, mix(hold, sepTo, open) / 2),
      facing: end.facing + 180 + COURTESY_HALF_TURN * k,
    };
  };

  return {
    takes: { lark: at(0, axisFrom + 180, spec.lark), robin: at(0, axisFrom, spec.robin) },
    bodyTurn: COURTESY_HALF_TURN,
    sweep: COURTESY_HALF_TURN,
    hold,
    pivot,
    turnBeats,
    lark: (t) => at(t, axisFrom + 180, spec.lark),
    robin: (t) => at(t, axisFrom, spec.robin),
  };
}

/**
 * How far apart a couple may turn, given the couples turning beside it.
 *
 * Two pairs of a minor set courtesy turn at once and their centres are one
 * place pitch apart — 20 px in duple improper — so a couple turning at the
 * library's own 14 px hold spacing would walk through the couple beside it.
 * {@link orbitRadius} is the same clearance the swing takes: the hold shrinks
 * until `CLEARANCE_PX` is left, and where nothing is close it does not
 * shrink at all.
 */
export function courtesyHold(spacing: number, pivot: Vec2, pivots: readonly Vec2[]): number {
  return Math.min(2 * orbitRadius(spacing / 2, pivot, pivots), COURTESY_REACH_HOLD_PX);
}

/**
 * Where a courtesy turn's two right hands go: **both on the robin's back**, two
 * points and never a join.
 *
 * The user: "robin right hand goes behind the back, lark right hand goes on
 * it." She reaches behind her own back with her right; he is on her left for
 * the whole turn — she is on his right, which is the same sentence — and at the
 * spacing this model holds a couple at, 11.5 px between two torsos against a 15
 * px arm, he lands on the near side of her back rather than reaching across it.
 * Two points two pixels apart, the same shape as the swing's free hand, which
 * is where the forward offset and the drop come from.
 */
export interface BackHands {
  /** The lark's right hand, round behind the robin. */
  lark: Hand;
  /** The robin's own right hand, behind her own back. */
  robin: Hand;
}

/** How far behind the robin's shoulders both right hands sit, px. */
export const TURN_BACK_FORWARD_PX = BACK_HAND_FORWARD_PX;
/** How far across her back the lark's right hand sits, toward him, px. */
export const TURN_BACK_LARK_RIGHT_PX = 2.5;
/** How far across her own back the robin's own right hand sits, toward him, px. */
export const TURN_BACK_ROBIN_RIGHT_PX = 0.5;
/** How far below his shoulders the lark's right hand sits, px. */
export const TURN_BACK_DROP_PX = BACK_HAND_DROP_PX;
/**
 * How far below her shoulders the robin's own right hand sits, px.
 *
 * Her own hand goes behind her own back, which is a folded arm however it is
 * placed — and a folded arm is where the elbow's azimuth is least determined,
 * which is what the oracle's elbow-per-hand column measures. Sitting it at
 * waist height rather than shoulder height is both what a dancer does and what
 * unfolds the arm: the hand is 5.2 px from her own shoulder at a drop of 1 and
 * 6.6 px at 4.
 */
export const TURN_BACK_ROBIN_DROP_PX = 4;

/**
 * The slack the reach cap leaves the arm solver, px.
 *
 * The estimate below is a first-order one — it ignores that the hand is also
 * behind the robin's shoulders and a pixel below them, and that the couple is
 * turning while it holds — so it wants a measured margin. Without one the cap
 * lands at 12 px of hold and `sequence.test.ts`'s AC1 sweep finds a lark's
 * right arm **0.067 px** short of its hand in a becket chain. Half a pixel
 * clears it with room to spare.
 */
const TURN_BACK_REACH_MARGIN_PX = 0.5;

/**
 * The widest hold at which the lark's right hand is still on the robin's back
 * rather than past the end of his arm, px.
 *
 * His right shoulder is half a shoulder width the far side of him from her, and
 * the hand sits {@link TURN_BACK_LARK_RIGHT_PX} in from her centre toward him,
 * so the arm has to span about `hold + SHOULDER_WIDTH_PX / 2 −
 * TURN_BACK_LARK_RIGHT_PX`. At the library's own 14 px hold spacing that is
 * 17.05 px of arm against 15, measured in a becket chain; this is where
 * {@link courtesyHold} caps every courtesy turn instead.
 */
export const COURTESY_REACH_HOLD_PX =
  ARM_REACH_PX - SHOULDER_WIDTH_PX / 2 + TURN_BACK_LARK_RIGHT_PX - TURN_BACK_REACH_MARGIN_PX;

/**
 * The two right hands of a courtesy turn, from where the two of them stand.
 *
 * Both points sit on the half of the robin's back that faces the lark, which
 * for a rigid courtesy turn is her **left** for the whole of it: she is on his
 * right, so he is on her left, before the turn, during it and after it. `side`
 * is the **cosine** of where he is round her rather than a sign so that the
 * hands slide rather than teleport if a figure ever hands this a pair that is
 * not in the hold — during the turn itself it is exactly −1 at every sample.
 */
export function courtesyBackHands(robin: Spot, lark: Spot): BackHands {
  const near = rightOf(robin.facing);
  const toward = sub(lark.p, robin.p);
  const away = Math.hypot(toward[0], toward[1]);
  const side = away <= 1e-9 ? 1 : (near[0] * toward[0] + near[1] * toward[1]) / away;
  return {
    lark: {
      p: bodyPoint(robin.p, robin.facing, TURN_BACK_FORWARD_PX, side * TURN_BACK_LARK_RIGHT_PX),
      drop: TURN_BACK_DROP_PX,
    },
    robin: {
      p: bodyPoint(robin.p, robin.facing, TURN_BACK_FORWARD_PX, side * TURN_BACK_ROBIN_RIGHT_PX),
      drop: TURN_BACK_ROBIN_DROP_PX,
    },
  };
}

/**
 * Which of a couple backs up and which walks forward, as `[lark, robin]`.
 *
 * The robin is the role set's top role — the one whose hand stacks on top —
 * which is the only thing in `@caller/choreo` that tells two roles apart, so a
 * courtesy turn asks it rather than knowing the word "lark". A pair of the same
 * role turns with the first of them backing up.
 */
export function larkAndRobin(
  ctx: { role(station: StationId): RoleName; roleSet: RoleSet },
  pair: readonly [StationId, StationId],
): [StationId, StationId] {
  const [a, b] = pair;
  return ctx.role(a) === ctx.roleSet.top && ctx.role(b) !== ctx.roleSet.top ? [b, a] : [a, b];
}
