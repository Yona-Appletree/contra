import type { Angle, Beat, Hand, Vec2 } from "@caller/core";
import {
  ARM_REACH_PX,
  SHOULDER_WIDTH_PX,
  angleDiff,
  bodyPoint,
  dirOf,
  dist,
  mix,
  norm,
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
 * rigid half turn is its own inverse, so the take is the end reflected through
 * the pivot: he stands on her side of the pivot and she on his, one
 * {@link CourtesyTurnSpec.hold} apart. A figure hands this function the two
 * *end* places and is told, in {@link CourtesyTurn.takes}, where it has to walk
 * its two dancers first. In a chain that means the lark steps across the middle
 * of the set to meet her and wheels back out of it — which is the price of a
 * hall whose two lines stand further apart than a couple holds, and is written
 * up in the reports for F7 and F8.
 *
 * **Where the pivot sits between them is the one thing that is a choice**, and
 * the user made it: see {@link CourtesyTurnSpec.pivotFromLark}.
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
  /** The point on the couple's line the whole turn happens about. */
  pivot: Vec2;
  /** How far that point is from the lark, px: the small circle he backs round. */
  larkRadius: number;
  /** How far it is from the robin, px: the big arc she walks. */
  robinRadius: number;
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
  /**
   * How far from the lark, along the couple's own line, the pair pivots, px.
   *
   * The user, asked where the courtesy turn's pivot sits:
   *
   * > "I think its near the lark, but its a little hard for me to imagine
   * > without doing the dance with 4 people"
   *
   * So it is a number and not a fact: the lark backs round a circle of this
   * radius and the robin walks the big arc of `hold − pivotFromLark`, and the
   * user judges the distance by eye on the tile. `hold / 2` — the point midway
   * between the two bodies — is what F7 shipped and is the one thing in that
   * milestone the user corrected. See {@link COURTESY_PIVOT_FROM_LARK_PX} for
   * the default and for what the number costs at each end of its range.
   */
  pivotFromLark: number;
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
  const larkRadius = Math.min(Math.max(spec.pivotFromLark, 0), hold);
  const robinRadius = hold - larkRadius;
  const axisTo = bearing(spec.lark.p, spec.robin.p);
  const axisFrom = axisTo - COURTESY_HALF_TURN;
  const turnBeats = Math.max(0, spec.beats - Math.min(Math.max(spec.openBeats, 0), spec.beats));

  // Each dancer keeps their own radius for the whole rotation and then opens
  // out along their own ray to their own place, which is `sepTo / 2` from the
  // pivot: the two of them are one rigid body at every sample of the turn
  // whatever the two radii are, because they share the pivot and the angle.
  const at = (t: Beat, from: Angle, radius: number, end: Spot): Spot => {
    const k = turnBeats <= 0 ? 1 : smooth(t / turnBeats);
    const open = ramp(t, turnBeats, spec.beats);
    return {
      p: polar(pivot, from + COURTESY_HALF_TURN * k, mix(radius, sepTo / 2, open)),
      facing: end.facing + 180 + COURTESY_HALF_TURN * k,
    };
  };

  return {
    takes: {
      lark: at(0, axisFrom + 180, larkRadius, spec.lark),
      robin: at(0, axisFrom, robinRadius, spec.robin),
    },
    bodyTurn: COURTESY_HALF_TURN,
    sweep: COURTESY_HALF_TURN,
    hold,
    pivot,
    larkRadius,
    robinRadius,
    turnBeats,
    lark: (t) => at(t, axisFrom + 180, larkRadius, spec.lark),
    robin: (t) => at(t, axisFrom, robinRadius, spec.robin),
  };
}

/**
 * The other candidate courtesy turn (F9): the lark **steps in** a little, she
 * comes the whole way to him, and the couple **spins** instead of wheeling.
 *
 * This is the geometry `main` dances today (F5), written as a second
 * constructor so that the two can be put side by side rather than argued about.
 * It gives up exactly one thing {@link courtesyTurn} guarantees — that the
 * couple is a rigid body — and buys with it the one thing a rigid turn provably
 * cannot have at this set width: a **right-shoulder** pull by in the centre.
 *
 * **Why the two cannot both be had.** A rigid half turn reverses the couple's
 * own line, so the take is the finish reflected through the pivot: the robin
 * stands on the far side of the lark from her own place when the hands close,
 * which is to say she stops short of the middle of the set and so does the
 * other robin — and two robins who both stop short of the middle are on each
 * other's *left*, at any pivot (F8's closed form; see `knownWrong.ts`). To pass
 * right shoulders she has to keep going past the middle, which means her take
 * is on the *near* side of the lark — his left — and a body that turns 180°
 * swaps which of its own sides a fixed direction is on, so the couple's line
 * has to sweep **nothing at all** for her to end on his right. The two bodies
 * do all of the turning and the couple's line only drifts. That is what "the
 * arms basically stay put" costs here: the joined hands slide across the two
 * bodies instead of riding them.
 *
 * The one knob is {@link StepInTurnSpec.stepInPx}: how far off his place the
 * lark steps to meet her, which is also how far short of her own place she
 * stops. A small step leaves him nearly home and the couple taking hands a long
 * way apart; a large one walks him into the set and closes the take up.
 */
export function stepInTurn(spec: StepInTurnSpec): CourtesyTurn {
  // She stops `stepInPx` short of her place, still on the line she pulled by
  // along; he steps the same distance off his place straight at her, but never
  // so far that the two of them are already inside the hold — in becket her
  // place is 20 px from his and the whole step would walk him into her.
  const robinTake = toward(spec.robin.p, spec.robinFrom, spec.stepInPx);
  const step = Math.min(spec.stepInPx, Math.max(0, dist(spec.lark.p, robinTake) - spec.hold));
  const larkTake = toward(spec.lark.p, robinTake, step);
  const takes = {
    lark: { p: larkTake, facing: spec.lark.facing + 180 },
    robin: { p: robinTake, facing: spec.robin.facing + 180 },
  };

  // His body turns the way his feet go: the half turn, round the way that
  // leaves the ground he covers behind him.
  const bodyTurn = backwardArc(180, sub(spec.lark.p, larkTake), takes.lark.facing);

  const axisFrom = bearing(larkTake, robinTake);
  const axisTo = bearing(spec.lark.p, spec.robin.p);
  const arc = angleDiff(axisFrom, axisTo);
  // A couple that swaps ends has an axis that turns a half either way and
  // `angleDiff` cannot say which; the bodies can.
  const sweep = Math.abs(Math.abs(arc) - 180) < 1e-9 ? Math.sign(bodyTurn) * 180 : arc;

  const pivotFrom = midpoint(larkTake, robinTake);
  const pivotTo = midpoint(spec.lark.p, spec.robin.p);
  const sepFrom = dist(larkTake, robinTake);
  const sepTo = dist(spec.lark.p, spec.robin.p);
  const hold = Math.min(spec.hold, sepFrom);
  const openBeats = Math.min(Math.max(spec.openBeats, 0), spec.beats);
  const closeBeats = Math.min(Math.max(spec.closeBeats, 0), spec.beats - openBeats);
  // The rotation finishes before the opening out begins, as the rigid turn's
  // does, so the two candidates can be read against the same beats.
  const turnBeats = spec.beats - openBeats;

  const at = (t: Beat, side: -1 | 1, end: Spot): Spot => {
    const k = turnBeats <= 0 ? 1 : smooth(Math.min(t, turnBeats) / turnBeats);
    const close = closeBeats <= 0 ? 1 : ramp(t, 0, closeBeats);
    const open = ramp(t, turnBeats, spec.beats);
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
    pivot: pivotFrom,
    larkRadius: hold / 2,
    robinRadius: hold / 2,
    turnBeats,
    lark: (t) => at(t, -1, spec.lark),
    robin: (t) => at(t, 1, spec.robin),
  };
}

/** What a figure hands {@link stepInTurn}. */
export interface StepInTurnSpec {
  /** Where the turn leaves the lark: his place, facing in. */
  lark: Spot;
  /** Where the turn leaves the robin: beside him on his right, facing in. */
  robin: Spot;
  /** Where the robin is coming from, so her take sits on her way there. */
  robinFrom: Vec2;
  /** How far apart the couple turns once it has closed up, px. */
  hold: number;
  /**
   * How far the lark steps off his place to meet her, px — and how far short of
   * her own place she stops. The whole difference between F9's two step-in
   * candidates is this number.
   */
  stepInPx: number;
  /** How long the whole turn takes. */
  beats: Beat;
  /** How long the couple takes to close up on to the hold, at the start. */
  closeBeats: Beat;
  /** How long the opening out on to the two places takes, at the end. */
  openBeats: Beat;
}

/**
 * How far apart a **spinning** couple may turn: the whole hold, halved for the
 * couple beside it.
 *
 * {@link courtesyHold}'s rule is the rigid turn's — the clearance is spent on
 * the robin's arc and the lark's circle is added back. A couple that spins has
 * no arc and no circle: the two of them stand `hold` apart and turn on the
 * spot, so the clearance is the whole hold's to spend, which is what `main`'s
 * own courtesy hold does and what this is.
 */
export function stepInHold(spacing: number, pivot: Vec2, pivots: readonly Vec2[]): number {
  return Math.min(2 * orbitRadius(spacing / 2, pivot, pivots), COURTESY_REACH_HOLD_PX);
}

/**
 * `arc`, or the way round the other way, so that a dancer who covers `move`
 * while turning it is walking backward — judged half way round, which is where
 * `walksBackward` reads the facing and where a turning dancer's facing is the
 * one the whole arc is about.
 */
function backwardArc(arc: number, move: Vec2, facing: Angle): number {
  const other = arc > 0 ? arc - 360 : arc + 360;
  const forward = (a: number): number => {
    const d = dirOf(facing + a / 2);
    return move[0] * d[0] + move[1] * d[1];
  };
  return forward(arc) <= forward(other) ? arc : other;
}

/** `d` px from `a` along the line toward `b`; `a` itself if the two coincide. */
function toward(a: Vec2, b: Vec2, d: number): Vec2 {
  const away = sub(b, a);
  if (Math.hypot(away[0], away[1]) <= 1e-9) return a;
  const u = norm(away);
  return [a[0] + u[0] * d, a[1] + u[1] * d];
}

/**
 * How far apart a couple may turn, given the couples turning beside it.
 *
 * Two pairs of a minor set courtesy turn at once and their centres are one
 * place pitch apart — 20 px in duple improper — so a couple turning at the
 * library's own 14 px hold spacing would walk through the couple beside it.
 * {@link orbitRadius} is the same clearance the swing takes: the radius shrinks
 * until `CLEARANCE_PX` is left, and where nothing is close it does not shrink
 * at all.
 *
 * **What the pivot changes.** The number this returns is the *sum* of the two
 * radii, and the clearance is spent on the **robin's** arc: she is the one who
 * swings wide, and where the pivot sits is not her business. So her arc is what
 * it always was — half the widest hold, cut down to `CLEARANCE_PX` by the
 * couple turning beside her, which is 5.75 px in every formation the library
 * dances — and the hold is her arc plus his circle. Moving the pivot toward the
 * lark therefore leaves the robin's whole path alone, in both formations, and
 * closes the couple up by exactly what it takes off his circle.
 *
 * At `pivotFromLark = 0` that leaves a couple turning 5.75 px apart, which is
 * two torsos inside AC6's 8 px: the pivot cannot go all the way to the lark,
 * and this is the number that says so rather than a rule that hides it.
 */
export function courtesyHold(
  spacing: number,
  pivot: Vec2,
  pivots: readonly Vec2[],
  pivotFromLark: number,
): number {
  const want = Math.min(spacing, COURTESY_REACH_HOLD_PX) / 2;
  const lark = Math.max(pivotFromLark, 0);
  return Math.min(lark + orbitRadius(want, pivot, pivots), COURTESY_REACH_HOLD_PX);
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
 * How far from the lark the courtesy turn pivots by default, px: a quarter of
 * the widest hold, which is **2.875**.
 *
 * The user ruled the pivot is **near the lark**, and said in the same breath
 * that they could not fix the distance from memory — "it's a little hard for me
 * to imagine without doing the dance with 4 people" — so this is a small number
 * to be judged by eye, with the reasons for its two neighbours written down
 * rather than guessed at:
 *
 * - **0**, the lark turning on the spot, is not available. The clearance to the
 *   couple turning beside them caps the robin's arc at 5.75 px in duple
 *   improper, so the whole hold would be 5.75 px and the couple itself would be
 *   two torsos 5.75 px apart, inside AC6's 8. See {@link courtesyHold}.
 * - **`hold / 2`**, 5.75, the point midway between the two bodies, is what F7
 *   shipped and what the user corrected: the lark backs round an 18.06 px
 *   semicircle there against 9.03 px here, and walks 50.06 px against 41.03 in
 *   a chain.
 *
 * What the pivot does **not** buy is the pull by, which is the thing the
 * milestone that added it went looking for: where the robin takes hands is
 * `hold` behind where the lark takes them, whatever the pivot, so moving the
 * pivot toward the lark leaves the two robins passing exactly where they did.
 * The arithmetic is in `knownWrong.ts`.
 */
export const COURTESY_PIVOT_FROM_LARK_PX = COURTESY_REACH_HOLD_PX / 4;

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
