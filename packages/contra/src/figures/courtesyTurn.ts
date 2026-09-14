import type { Angle, Beat, Hand, Vec2 } from "@caller/core";
import {
  ARM_REACH_PX,
  SHOULDER_WIDTH_PX,
  angleDiff,
  bodyPoint,
  dirOf,
  dist,
  mix,
  ramp,
  rightOf,
  smooth,
  sub,
} from "@caller/core";
import type { RoleName, RoleSet, StationId } from "@caller/choreo";
import type { Spot } from "./ContraFigure.js";
import { bearing, midpoint, orbitRadius } from "./ContraFigure.js";
import { BACK_HAND_DROP_PX, BACK_HAND_FORWARD_PX } from "../pair/swing.js";

/**
 * The courtesy turn: the couple closes up, turns **half way round**, and opens
 * out on to its two places with the robin on the lark's right.
 *
 * The user, who is the authority on what this figure is:
 *
 * > "on the courtesy turn... it usually is just a half turn if I have it right
 * > in my mind. robins pull-by right in the center, give left hand to the larks
 * > left, right hand goes on their back and lark's right goes there too, robins
 * > walk forward a half turn while larks walk backwards until both face in
 * > again, with robin on the right."
 *
 * So the half turn this file guarantees is the **bodies'**: each of the two
 * turns through exactly {@link COURTESY_HALF_TURN}, the way round that leaves
 * the lark's feet behind him, from facing *out* when the hands close to facing
 * *in* when the turn is over. Two figures do it — `robins-chain` and
 * `right-and-left-through` — and this is the piece of choreography they share.
 *
 * **What the couple's own line does is not free, and it is not always 180°.**
 * The figure says where its two dancers are standing when the hands close and
 * where the turn has to leave them; the couple then closes up on to the hold,
 * turns, and opens out on to the two places. The line sweeps from the axis the
 * two take points make on to the axis the two end places make:
 *
 * - **Right and left through** arrives with the robin on the lark's right and
 *   leaves her on his right on the *other* pair of places, so the line sweeps a
 *   clean 180° with the bodies. It is a rigid half turn, the textbook picture.
 * - **A chain** arrives with the robin on the lark's **left** — she has come
 *   across the set and he has stepped out to meet her coming — and leaves her
 *   on his right. A body that turns 180° swaps which of its own sides a fixed
 *   direction is on, so the line has to sweep **nothing at all** for that to
 *   happen. The chain's couple therefore spins rather than wheels, and opens
 *   out on to two places a whole set's width apart while it does.
 *
 * That difference is geometry, not choice: `bearing(lark, robin) − larkFacing`
 * is which side of him she is on, and it changes by `sweep − bodyTurn`. Ask for
 * a 180° sweep *and* a side change and there is no such motion. The whole of
 * the arithmetic is in {@link CourtesyTurn.sweep}, which is `angleDiff` of the
 * two axes — and `angleDiff` answers `+180` for a half turn either way, so a
 * right and left through's direction is decided by the bodies and nowhere else.
 */
export const COURTESY_HALF_TURN = 180;

/** The turn, planned: where it takes the couple from, and where it puts them. */
export interface CourtesyTurn {
  /** Where the two of them stand, and face, when the hands close. */
  takes: { lark: Spot; robin: Spot };
  /** Where the lark is `t` beats into the turn. */
  lark(t: Beat): Spot;
  /** Where the robin is `t` beats into the turn. */
  robin(t: Beat): Spot;
  /** How far each body turns, signed degrees: ±{@link COURTESY_HALF_TURN}. */
  bodyTurn: number;
  /** How far the couple's own line sweeps, signed degrees. */
  sweep: number;
  /** How far apart the couple turns, px. */
  hold: number;
}

/** What a figure hands {@link courtesyTurn}. */
export interface CourtesyTurnSpec {
  /** Where the lark stands when the hands close, having walked there. */
  larkTake: Vec2;
  /** Where the robin stands when the hands close, having walked there. */
  robinTake: Vec2;
  /** Where the turn leaves the lark: his place, facing in. */
  lark: Spot;
  /** Where the turn leaves the robin: beside him on his right, facing in. */
  robin: Spot;
  /**
   * How far apart the couple turns once it has closed up, px; see
   * {@link courtesyHold}. Never more than they arrive at.
   */
  hold: number;
  /** How long the whole turn takes. */
  beats: Beat;
  /**
   * How long the couple takes to close up on to the hold, at the start.
   *
   * A right and left through arrives with the two of them standing on places a
   * whole set apart, which is more than twice a hold, so they walk in as the
   * hands go up. A chain arrives all but closed already and this costs it
   * almost nothing.
   */
  closeBeats: Beat;
  /**
   * How long the opening out on to the two places takes, at the end.
   *
   * The couple turns at the hold and ends on places that can be a whole set
   * apart — 32 px in duple improper against a 14 px hold — so the opening out
   * has to happen somewhere. It happens last, over this many beats, which is
   * also when the hands let go: joined hands on a couple that has already
   * opened out are further apart than two arms reach.
   */
  openBeats: Beat;
}

/**
 * The couple's half turn, from the closed hold on to the two places.
 *
 * Both dancers are placed from the same three numbers — the pivot, the axis and
 * the separation — so the two of them are one couple at every instant and their
 * joined hands are one point by construction rather than by agreement.
 */
export function courtesyTurn(spec: CourtesyTurnSpec): CourtesyTurn {
  const takes = {
    lark: { p: spec.larkTake, facing: spec.lark.facing + 180 },
    robin: { p: spec.robinTake, facing: spec.robin.facing + 180 },
  };

  // His body turns the way his feet go: the half turn, round the way that
  // leaves the ground he covers behind him.
  const bodyTurn = backwardArc(
    COURTESY_HALF_TURN,
    sub(spec.lark.p, spec.larkTake),
    takes.lark.facing,
  );

  const axisFrom = bearing(spec.larkTake, spec.robinTake);
  const axisTo = bearing(spec.lark.p, spec.robin.p);
  const arc = angleDiff(axisFrom, axisTo);
  // A couple that swaps ends — right and left through — has an axis that turns
  // a half either way, and `angleDiff` cannot say which; the bodies can.
  const sweep =
    Math.abs(Math.abs(arc) - COURTESY_HALF_TURN) < 1e-9
      ? Math.sign(bodyTurn) * COURTESY_HALF_TURN
      : arc;

  const pivotFrom = midpoint(spec.larkTake, spec.robinTake);
  const pivotTo = midpoint(spec.lark.p, spec.robin.p);
  const sepFrom = dist(spec.larkTake, spec.robinTake);
  const sepTo = dist(spec.lark.p, spec.robin.p);
  const hold = Math.min(spec.hold, sepFrom);
  const closeBeats = Math.min(Math.max(spec.closeBeats, 0), spec.beats);
  const openBeats = Math.min(Math.max(spec.openBeats, 0), spec.beats);

  const at = (t: Beat, side: -1 | 1, end: Spot): Spot => {
    const k = spec.beats <= 0 ? 1 : smooth(t / spec.beats);
    const close = closeBeats <= 0 ? 1 : ramp(t, 0, closeBeats);
    const open = openBeats <= 0 ? k : ramp(t, spec.beats - openBeats, spec.beats);
    const axis = dirOf(axisFrom + sweep * k);
    const reach = (mix(mix(sepFrom, hold, close), sepTo, open) / 2) * side;
    const pivot: Vec2 = [mix(pivotFrom[0], pivotTo[0], k), mix(pivotFrom[1], pivotTo[1], k)];
    return {
      p: [pivot[0] + axis[0] * reach, pivot[1] + axis[1] * reach],
      facing: end.facing - bodyTurn * (1 - k),
    };
  };

  return {
    takes,
    bodyTurn,
    sweep,
    hold,
    lark: (t) => at(t, -1, spec.lark),
    robin: (t) => at(t, 1, spec.robin),
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
 * `arc`, or the way round the other way, so that a dancer who covers `move`
 * while turning it is walking backward — judged half way round, which is where
 * `walksBackward` reads the facing and where a turning dancer's facing is the
 * one the whole arc is about.
 */
export function backwardArc(arc: number, move: Vec2, facing: Angle): number {
  const other = theOtherWay(arc);
  const forward = (a: number): number => {
    const d = dirOf(facing + a / 2);
    return move[0] * d[0] + move[1] * d[1];
  };
  return forward(arc) <= forward(other) ? arc : other;
}

/** The same turn, round the other way. */
const theOtherWay = (arc: number): number => (arc > 0 ? arc - 360 : arc + 360);

/**
 * Where a courtesy turn's two right hands go: **both on the robin's back**, two
 * points and never a join.
 *
 * The user: "right hand goes on their back and lark's right goes there too."
 * She reaches behind her own back with her right; he is on her left, and at the
 * spacing this model holds a couple at — 14 px between two torsos, against a 15
 * px arm — he lands on the near side of her back rather than reaching across
 * it. Two points two pixels apart, the same shape as the swing's free hand,
 * which is where the forward offset and the drop come from.
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
 * Both points sit on the half of the robin's back that faces the lark — her
 * right in a right and left through and her left in a chain, because the two
 * figures hand her to him on opposite sides. At the spacing this model holds a
 * couple at, an arm that reached across her instead would be longer than an
 * arm.
 *
 * `side` is the **cosine** of where he is round her rather than a sign, so that
 * a chain — where he starts on her right and ends on her left as she comes
 * round him — slides his hand across her back instead of teleporting it. As a
 * sign it jumped 5 px in one 1/32-beat sample, which is 156 px/beat of hand
 * against a 67 px/beat guard.
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
