import type { Angle, Beat, Hand, MotionProfile, Vec2 } from "@caller/core";
import {
  ARM_REACH_PX,
  HOLD_SPACING_PX,
  SHOULDER_WIDTH_PX,
  angleLerp,
  angleOfVec,
  bodyPoint,
  dist,
  len,
  mix,
  norm,
  profileProgress,
  profileSpeed,
  ramp,
  rightOf,
  smooth,
  sub,
} from "@caller/core";
import type { RoleName, RoleSet, StationId } from "@caller/choreo";
import type { Spot } from "./ContraFigure.js";
import { bearing, midpoint, orbitRadius, polar } from "./ContraFigure.js";
import { BACK_HAND_DROP_PX, BACK_HAND_FORWARD_PX } from "../library/figures/swing.js";

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
  /**
   * Where a dancer is **before** the take, `t` beats into the *figure* — for a
   * turn that is already moving its dancers while the pull by happens.
   *
   * Absent on {@link courtesyTurn}, whose dancers stand on their places until
   * the figure walks them to {@link CourtesyTurn.takes};
   * present on {@link orbitTurn}, whose robin has to arrive on his circle
   * travelling at its own speed, which a straight walk cannot do.
   * `approach(who, joinBeat)` is `takes[who]` exactly, so the two halves of the
   * figure meet without a step.
   */
  approach?(who: "lark" | "robin", t: Beat): Spot;
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
  /**
   * How the rotation spends its beats (M10); default `"smooth"`, which is what
   * the coded figure that still calls this gets by saying nothing (A7).
   */
  profile?: MotionProfile;
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
    const k = turnBeats <= 0 ? 1 : profileProgress(spec.profile ?? "smooth", t, turnBeats);
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
 * The whole orbit, signed degrees: two {@link COURTESY_HALF_TURN}s, so the
 * orbit runs the same way round the floor as the courtesy turn it replaces.
 */
export const ORBIT_FULL_TURN = 2 * COURTESY_HALF_TURN;

/**
 * F10's candidate: **the courtesy turn as the lark's own orbit**, which the
 * robin joins as it begins.
 *
 * The user, a caller, watching the chain back and describing what is missing:
 *
 * > "in 8 beats / the larks orbit backwards 1 full turn around the point
 * > between where they and the robin started. / the robins pull by to join the
 * > larks 1/4 of the way through. (2 beats) / they both finish the orbit."
 *
 * Nothing else in this file does that. {@link courtesyTurn} leaves the lark
 * standing on his place until the hands close and then turns the couple a
 * **half**; here he is walking backward from
 * beat one, turns a **whole**, and the take happens at a point he has already
 * carried off his own place — which is the one thing that puts her take on the
 * **inner** side of his line, past the middle of the set, where a
 * right-shoulder pull by can reach it. F8 proved a rigid half turn cannot do
 * that at any pivot; a full orbit is not a tuning of it but a different figure.
 *
 * Three things are true by construction, the same way {@link courtesyTurn}'s
 * three are:
 *
 * - **He walks backward the whole way.** His facing turns with the orbit at
 *   exactly its own rate, so his velocity is always dead astern of him.
 * - **The pair is rigid from the join.** Both bodies and the couple's own line
 *   turn together, so she is on his right at every sample and the four hands
 *   keep their body-local offsets — the user's "the arms basically stay put" —
 *   until the couple opens out on to the places over the last
 *   {@link OrbitTurnSpec.openBeats}.
 * - **The ends are exact.** His circle is centred half a hold off his own place
 *   toward hers, so a whole turn puts him back on the pixel he started on; she
 *   rides the antipode and opens out along it on to her place.
 *
 * **What the model makes us choose.** The user's picture has the lark's place
 * and the robin's place one hold apart, which is what a real couple stands at
 * — so "the centre half way between the two spots", "the circle is one hold
 * wide" and "he ends where he started" are one statement. Here the two places
 * are 20 px apart in becket and 32 px apart in a duple improper group of four,
 * against an 11.5 px hold, so they are three statements and only two of them
 * can hold. This keeps the **circle one hold wide** and the **ends exact**, and
 * gives up "the centre is half way between the two places": the centre sits
 * `hold / 2` from him toward her place, and she opens out along the ray from it
 * on to her place over the last beats, exactly as {@link courtesyTurn}'s couple
 * opens out of its own hold.
 */
export function orbitTurn(spec: OrbitTurnSpec): CourtesyTurn {
  const away = sub(spec.robin.p, spec.lark.p);
  const gap = len(away);
  const u: Vec2 = gap <= 1e-9 ? [1, 0] : norm(away);
  const hold = Math.min(spec.hold, gap);
  const radius = hold / 2;
  const centre: Vec2 = [spec.lark.p[0] + u[0] * radius, spec.lark.p[1] + u[1] * radius];
  // Where he is round the circle at beat 0: on the far side of the centre from
  // her place, which is his own place.
  const from = bearing(centre, spec.lark.p);
  const beats = spec.beats;
  const join = Math.min(Math.max(spec.joinBeat, 0), beats);
  const openFrom = Math.max(beats - Math.max(spec.openBeats, 0), join);

  /**
   * Which beat his own turn starts on, and how long it then has.
   *
   * **M10c.** The orbit used to span the whole figure, so the lark was already
   * a fifth of the way round it by the time she reached him and the join could
   * not be moved without moving her take. The turn now starts where
   * {@link OrbitTurnSpec.turnFrom} says — `0` is the whole figure, as it was —
   * and the user's chain has it start when the robins have finished pulling by,
   * which is what a chain looks like on the floor: the lark receives her.
   */
  const turnFrom = Math.min(Math.max(spec.turnFrom ?? 0, 0), join);
  const turning = beats - turnFrom;

  /**
   * How far round he is `t` beats in, signed degrees; zero speed at both ends.
   *
   * On the cruise (M10) the orbit turns at a **constant rate** for the middle of
   * its own beats, which is the direction debt 5 asked for.
   */
  const profile = spec.profile ?? "smooth";
  const spin = (t: Beat): number =>
    t <= turnFrom || turning <= 0
      ? 0
      : ORBIT_FULL_TURN * profileProgress(profile, t - turnFrom, turning);
  /** `spin`'s own derivative, degrees per beat, so the join is exact and not sampled. */
  const spinRate = (t: Beat): number =>
    t <= turnFrom || turning <= 0
      ? 0
      : ORBIT_FULL_TURN * profileSpeed(profile, t - turnFrom, turning);

  const larkAt = (t: Beat): Spot => ({
    p: polar(centre, from + spin(t), radius),
    facing: spec.lark.facing + spin(t),
  });
  /**
   * Where she is: the antipode of his circle, and then **straight out on to her
   * place** over the last {@link OrbitTurnSpec.openBeats}.
   *
   * M10b. The opening out used to grow her *radius* while the orbit kept
   * sweeping her round it, which is a spiral: she travelled the widening arc as
   * well as the 20.5 px she actually had to cover, and the arc is what made the
   * last beat of a chain the fastest beat in the library — 17.09 px/beat
   * against the orbit's own 5.16. A chord covers the same ground in the same
   * beats without the arc on top, and rides the figure's own profile while it
   * does, like every other walk since M10.
   *
   * Both ends are exact either way: at `openFrom` the blend is zero, so she is
   * on the orbit, and at the last beat it is one, so she is on her own place to
   * the pixel.
   */
  const robinAt = (t: Beat): Spot => {
    const on = polar(centre, from + spin(t) + 180, radius);
    const out =
      beats - openFrom <= 0 ? 1 : profileProgress(profile, t - openFrom, beats - openFrom);
    return {
      p: [mix(on[0], spec.robin.p[0], out), mix(on[1], spec.robin.p[1], out)],
      facing: spec.lark.facing + spin(t),
    };
  };

  const takes = { lark: larkAt(join), robin: robinAt(join) };

  // Her arrival velocity is the orbit's own, so that she "joins the backwards
  // pivot" rather than stopping dead on it and being picked up again.
  const arriveAngle = from + spin(join) + 180;
  const arriveRate = (radius * spinRate(join) * Math.PI) / 180;
  const arrive = rightOf(arriveAngle);
  const arriveVelocity: Vec2 = [arrive[0] * arriveRate, arrive[1] * arriveRate];

  // Her plain walk on to the orbit: from a standstill on her own place to the
  // take, arriving at the orbit's own speed and in its own direction.
  const chord = sub(takes.robin.p, spec.robinFrom.p);
  const plain: Leg = {
    from: spec.robinFrom.p,
    v0: [0, 0],
    to: takes.robin.p,
    v1: arriveVelocity,
    beats: join,
  };

  // **Whether there is a pull by to shape at all.** The two robins' paths are
  // point reflections of each other through the set's centre at every instant
  // (F8's closed form), so how near they come is exactly twice how near one of
  // them comes to that centre — and `HOLD_SPACING_PX` is the library's own
  // number for two dancers close enough to be passing rather than circling
  // (`figureChecks.ts` measures every pass against it). Where the plain walk
  // already brings them that close, the dip below decides which shoulder and
  // how much room; where it does not — a duple improper group of four standing
  // alone, whose two lines are 32 px apart, puts both takes on their own side
  // of the middle and the robins never meet — bending her path through the
  // centre would send her out and back through it for a pull by that is not
  // there, which is a near miss rather than a pass.
  const meets = 2 * nearestApproach(plain, spec.centre) < HOLD_SPACING_PX;

  // The pull by itself: `passPx` to her own left of the set's centre, so the
  // two of them cross `2 · passPx` apart with right shoulders together. Three
  // knots — standing still on her place, the pull by, the take — joined by two
  // cubics whose middle velocity is the Catmull-Rom one (the whole chord over
  // the whole approach), which is what makes them one curve rather than two
  // walks with a corner between them.
  const along = len(chord) <= 1e-9 ? ([1, 0] as Vec2) : norm(chord);
  const left: Vec2 = [along[1], -along[0]];
  const pass: Vec2 = [
    spec.centre[0] + left[0] * spec.passPx,
    spec.centre[1] + left[1] * spec.passPx,
  ];
  const half = join / 2;
  const middleVelocity: Vec2 = join <= 1e-9 ? [0, 0] : [chord[0] / join, chord[1] / join];
  const legs: Leg[] =
    join <= 1e-9
      ? []
      : meets
        ? [
            { from: spec.robinFrom.p, v0: [0, 0], to: pass, v1: middleVelocity, beats: half },
            { from: pass, v0: middleVelocity, to: takes.robin.p, v1: arriveVelocity, beats: half },
          ]
        : [plain];

  const legAt = (t: Beat): { leg: Leg; local: Beat } | undefined => {
    if (legs.length === 0) return undefined;
    if (legs.length === 1) return { leg: legs[0]!, local: t };
    return t <= half ? { leg: legs[0]!, local: t } : { leg: legs[1]!, local: t - half };
  };
  const walkTo = (t: Beat): Vec2 => {
    const at = legAt(t);
    return at === undefined ? takes.robin.p : hermite(at.leg, at.local);
  };
  const walkSpeed = (t: Beat): Vec2 => {
    const at = legAt(t);
    return at === undefined ? [0, 0] : hermiteRate(at.leg, at.local);
  };
  // `walkStep`'s own two-stage facing: turn to the way you are walking, then
  // turn to the facing the take wants. She starts from a standstill, so the
  // direction of travel at beat 0 is read a hair after it.
  const turn = Math.min(1, join / 4);
  const travel = (t: Beat): Angle => {
    const v = walkSpeed(Math.max(t, join * 1e-4));
    return len(v) <= 1e-12 ? spec.robinFrom.facing : angleOfVec(v);
  };
  const walkFacing = (t: Beat): Angle =>
    angleLerp(
      angleLerp(spec.robinFrom.facing, travel(t), turn <= 0 ? 1 : smooth(t / turn)),
      takes.robin.facing,
      turn <= 0 ? 1 : smooth((t - (join - turn)) / turn),
    );

  return {
    takes,
    bodyTurn: ORBIT_FULL_TURN,
    sweep: ORBIT_FULL_TURN,
    hold,
    pivot: centre,
    larkRadius: radius,
    robinRadius: radius,
    turnBeats: beats - join,
    lark: (t) => larkAt(t + join),
    robin: (t) => robinAt(t + join),
    approach: (who, t) => (who === "lark" ? larkAt(t) : { p: walkTo(t), facing: walkFacing(t) }),
  };
}

/** What a figure hands {@link orbitTurn}. */
export interface OrbitTurnSpec {
  /** His place, facing in: where the orbit starts him and where it leaves him. */
  lark: Spot;
  /** Where the orbit leaves her: the place on his right, facing in. */
  robin: Spot;
  /** Where she is standing when the figure starts, on the far line. */
  robinFrom: Spot;
  /** The centre of the set, which is where the pull by happens. */
  centre: Vec2;
  /** How wide his circle is, px: the couple's hold; see {@link stepInHold}. */
  hold: number;
  /** Which beat of the figure she arrives on the orbit at, and the hands close. */
  joinBeat: Beat;
  /**
   * Which beat the lark's own turn starts on, never later than
   * {@link OrbitTurnSpec.joinBeat}; default `0`, the whole figure.
   *
   * M10c: a chain's lark waits on his place while the robins pull by and then
   * spends his whole turn with her, so this is the join beat less however long
   * he moves to receive her. It is what makes the join beat a free number: with
   * the orbit spanning the whole figure, moving the join moved her take round
   * his circle with it and there was a point past which the two robins stopped
   * passing at all.
   */
  turnFrom?: Beat;
  /** How far to her own left of {@link OrbitTurnSpec.centre} she passes, px. */
  passPx: number;
  /** How long the whole figure takes: the orbit is one turn over all of it. */
  beats: Beat;
  /** How long the opening out on to the two places takes, at the end. */
  openBeats: Beat;
  /**
   * How the orbit spends its beats (M10); default `"smooth"`, so the coded
   * `robins-chain` that still calls this is untouched (A7).
   */
  profile?: MotionProfile;
}

/** One cubic of the robin's approach: two points, two velocities and a duration. */
interface Leg {
  from: Vec2;
  v0: Vec2;
  to: Vec2;
  v1: Vec2;
  beats: Beat;
}

/** A cubic Hermite along one {@link Leg}, `t` beats into it. */
function hermite(leg: Leg, t: Beat): Vec2 {
  const s = leg.beats <= 0 ? 1 : Math.min(Math.max(t / leg.beats, 0), 1);
  const ss = s * s;
  const sss = ss * s;
  const h00 = 2 * sss - 3 * ss + 1;
  const h10 = sss - 2 * ss + s;
  const h01 = -2 * sss + 3 * ss;
  const h11 = sss - ss;
  return [
    h00 * leg.from[0] + h10 * leg.beats * leg.v0[0] + h01 * leg.to[0] + h11 * leg.beats * leg.v1[0],
    h00 * leg.from[1] + h10 * leg.beats * leg.v0[1] + h01 * leg.to[1] + h11 * leg.beats * leg.v1[1],
  ];
}

/** How finely {@link nearestApproach} looks: fine enough to place a 0.1 px dip. */
const APPROACH_STEPS = 128;

/** How near one {@link Leg} comes to a point, px. */
function nearestApproach(leg: Leg, to: Vec2): number {
  let nearest = Infinity;
  for (let i = 0; i <= APPROACH_STEPS; i++) {
    const p = hermite(leg, (leg.beats * i) / APPROACH_STEPS);
    nearest = Math.min(nearest, Math.hypot(p[0] - to[0], p[1] - to[1]));
  }
  return nearest;
}

/** {@link hermite}'s velocity, px per beat. */
function hermiteRate(leg: Leg, t: Beat): Vec2 {
  if (leg.beats <= 0) return [0, 0];
  const s = Math.min(Math.max(t / leg.beats, 0), 1);
  const ss = s * s;
  const h00 = 6 * ss - 6 * s;
  const h10 = 3 * ss - 4 * s + 1;
  const h01 = -6 * ss + 6 * s;
  const h11 = 3 * ss - 2 * s;
  return [
    (h00 * leg.from[0] + h01 * leg.to[0]) / leg.beats + h10 * leg.v0[0] + h11 * leg.v1[0],
    (h00 * leg.from[1] + h01 * leg.to[1]) / leg.beats + h10 * leg.v0[1] + h11 * leg.v1[1],
  ];
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
