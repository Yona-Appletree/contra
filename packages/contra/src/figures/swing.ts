import type { Angle, Beat, Hand, Side, Vec2 } from "@caller/core";
import {
  BUZZ_STEPS_PER_BEAT,
  SHOULDER_WIDTH_PX,
  addScaled,
  angleDiff,
  angleLerp,
  bodyPoint,
  dirOf,
  dist,
  leftOf,
  lerp,
  lerpHand,
  ramp,
  rightOf,
} from "@caller/core";
import type { Station, StationId } from "@caller/choreo";
import { stationById } from "@caller/choreo";
import type {
  ContraParams,
  FigurePlan,
  HandJoin,
  PlanContext,
  Spot,
  Spots,
} from "./ContraFigure.js";
import {
  bearing,
  contraFigure,
  isCarried,
  joinPoint,
  joinedHands,
  midpoint,
} from "./ContraFigure.js";
import type { Pairing } from "./pairing.js";
import { pairsOf } from "./pairing.js";
import { handDown } from "../pair/PairFrame.js";
import { trapezoid, trapezoidSpeed } from "../pair/trapezoid.js";
import {
  BACK_HAND_DROP_PX,
  BACK_HAND_FORWARD_PX,
  BACK_HAND_RIGHT_PX,
  SHOULDER_HAND_INSET_PX,
  SWING_BODY_TURN_DEG,
  SWING_FLARE_PX,
  SWING_HAND_DROP_PX,
  SWING_LATERAL_PX,
  SWING_LEAN_PX,
  SWING_RADIUS_PX,
  swingFeet,
} from "../pair/swing.js";

/** Which way a swing opens out, in the group frame's own axes. */
export type EndFacing = "across" | "up" | "down" | number;

/** {@link swing}'s parameters. */
export interface SwingParams extends ContraParams {
  /** Who swings with whom. */
  pairs: Pairing;
  /** How many times round, in whole and half turns. */
  turns: number;
  /**
   * How far the outstretched joined hands sit in from the midpoint of the two
   * joined shoulders, px. The gate-3 tuning.
   */
  handOffset: number;
  /** Which way the pair faces when the swing opens out. */
  endFacing: EndFacing;
  /**
   * How far each dancer stands from the swing's centre when it opens out, px.
   * `null` takes it from the formation: half the distance between the two
   * stations the pair belongs to, which is what puts a swing's end exactly on
   * the places the next figure starts from.
   */
  endHalf: number | null;
}

/** Beats spent taking the hold at the start, and opening out at the end. */
const INTO_BEATS = 1;
const OPEN_BEATS = 1.4;

/** How far from the turning axis a dancer of M5's swing orbits, px. */
const ORBIT_PX = Math.hypot(SWING_RADIUS_PX, SWING_LATERAL_PX);

/**
 * How much room a swinging pair leaves the pair swinging beside them, px.
 *
 * Two pairs of a minor set swing at once — "balance and swing your partner" in
 * the lines is both couples at the same time — and their centres are one place
 * pitch apart, which is 20 px. Two dancers orbiting `ORBIT_PX` from centres 20
 * px apart pass 7.86 px from each other, just inside AC6's 8 px, so a pair with
 * another pair close by takes a slightly tighter hold: the orbit shrinks until
 * the gap is this number. At any wider spacing nothing changes and the swing is
 * M5's exactly.
 */
const SWING_CLEARANCE_PX = 8.5;

/**
 * Swing: take a ballroom hold, buzz round, and open out with the robin on the
 * right of the lark, facing `endFacing`.
 *
 * The turn, the buzz step, the hold, the lean and the flare are M5's, whose
 * numbers came from the two-dancers spike and gate 3 — this file imports them
 * rather than restating them. What is new is the ends: the pair walks in from
 * wherever the figure before left it, and opens out on to the formation's own
 * places, which is what lets "balance and swing your neighbour" *be* the duple
 * improper progression rather than merely end near it.
 */
export const swing = contraFigure<SwingParams>({
  id: "swing",
  call: "SWING",
  describe:
    "Ballroom hold: right hips together, the lark's right hand on the robin's back, her left on his shoulder, his left and her right joined out to the side. Buzz step round each other — one foot pushing, the other pivoting — for as many turns as the music gives, then open out side by side, lark on the left and robin on the right, facing whichever way the next figure needs. Both of them keep their weight on the inside foot and lean a little away from each other, which is what makes a swing spin instead of shuffle.",
  lead: 4,
  beats: 8,
  defaults: {
    from: {},
    pairs: "neighbors",
    turns: 2,
    handOffset: 5,
    endFacing: "across",
    endHalf: null,
  },

  plan: swingPlan,
});

/**
 * How a swing's hands start, when something other than a figure boundary
 * decides it.
 *
 * `balance-and-swing` is one figure and passes both: the joined hands of the
 * balance *are* the swing's hold, so the lark's left and the robin's right are
 * already joined when the turn begins, and the other two hands move from the
 * balance's second hold to the back and the shoulder over the first beat rather
 * than dropping to the hip and coming back up.
 */
export interface SwingHands {
  /** Where a hand starts, when it does not start at the dancer's hip. */
  from?: (station: StationId, side: Side) => Hand | undefined;
  /** Whether the outstretched hands are already joined at beat 0. */
  joinedAlready?: boolean;
}

/** The swing, planned: exported so `balance-and-swing` can dance the same turn. */
export function swingPlan(
  ctx: PlanContext,
  params: SwingParams,
  hands: SwingHands = {},
): FigurePlan {
  const beats = params.beats;
  const ends: Spots = {};
  const joins: HandJoin[] = [];
  /** Everything one pair needs, by station. */
  const pairOf: Record<StationId, SwingPair> = {};

  for (const [a, b] of pairsOf(params.pairs)) {
    const lark = ctx.role(a) === ctx.roleSet.top ? b : a;
    const robin = lark === a ? b : a;
    const centre = midpoint(ctx.spot(a).p, ctx.spot(b).p);
    const facing = endFacingOf(params.endFacing, ctx.spot(a).p, ctx.spot(b).p, centre);
    const half =
      params.endHalf ??
      placeHalf(ctx.stations, centre, facing, dist(ctx.spot(a).p, ctx.spot(b).p) / 2);
    // The line the turn starts on: from the centre toward the robin.
    const psi0 = bearing(centre, ctx.spot(robin).p);
    // Where the turn has to stop for the pair to open straight out on to
    // their end places: the lark's end lies at `facing − 90` from the centre
    // and the lark turns opposite the robin, so the line is `facing + 90`.
    // `turns` is therefore how many times round to the nearest half turn,
    // which is what a swing is; without this the pair can open out *through*
    // each other, and a probe catches them 3.3 px apart.
    const whole = 360 * params.turns;
    const pair: SwingPair = {
      lark,
      robin,
      centre,
      endFacing: facing,
      half,
      psi0,
      turn: whole + angleDiff(psi0 + whole, facing + 90),
    };
    pairOf[a] = pair;
    pairOf[b] = pair;
    ends[lark] = { p: addScaled(centre, leftOf(facing), half), facing };
    ends[robin] = { p: addScaled(centre, rightOf(facing), half), facing };
    joins.push({ a: lark, aSide: "L", b: robin, bSide: "R" });
  }
  for (const id of ctx.ids) ends[id] ??= ctx.spot(id);

  // Whether the outstretched hands are joined before the turn begins: because
  // the figure before was holding them and nobody let go, or because this is
  // the second half of one `balance-and-swing`.
  const carriedIn = joins.some((j) => isCarried(params.carried?.in, j.a, j.aSide, j.b, j.bSide));
  const joinedFromStart = carriedIn || hands.joinedAlready === true;

  // Leave the pair swinging beside you room to turn; see SWING_CLEARANCE_PX.
  const centres = [...new Set(Object.values(pairOf))].map((pair) => pair.centre);
  const squeeze = (pair: SwingPair): number => {
    let nearest = Infinity;
    for (const other of centres) {
      const gap = dist(pair.centre, other);
      if (gap > 1e-9) nearest = Math.min(nearest, gap);
    }
    if (!Number.isFinite(nearest)) return 1;
    return Math.max(0, Math.min(1, (nearest - SWING_CLEARANCE_PX) / (2 * ORBIT_PX)));
  };

  const placeAt = (station: StationId, t: Beat): Spot => {
    const pair = pairOf[station];
    if (!pair) return ctx.spot(station);
    const isLark = station === pair.lark;
    const sign = isLark ? -1 : 1;
    const psi = pair.psi0 + pair.turn * trapezoid(t, 0, 1.2, beats - 1.6, beats - 0.3);
    const into = ramp(t, 0, INTO_BEATS);
    const open = ramp(t, beats - OPEN_BEATS, beats);
    const tight = squeeze(pair);
    const turning = addScaled(
      addScaled(pair.centre, dirOf(psi), sign * SWING_RADIUS_PX * tight),
      leftOf(psi),
      -sign * SWING_LATERAL_PX * tight,
    );
    const end = ends[station] ?? ctx.spot(station);
    const start = ctx.spot(station);
    const p = lerp(lerp(start.p, turning, into), end.p, open);
    const held = psi + (isLark ? 0 : 180) - SWING_BODY_TURN_DEG * into;
    const facing = angleLerp(angleLerp(start.facing, held, into), pair.endFacing, open);
    return { p, facing };
  };

  const velocityAt = (station: StationId, t: Beat): Vec2 => {
    const dt = Math.min(t + SAMPLE_DT, beats) - t;
    if (dt <= 0) return [0, 0];
    const here = placeAt(station, t);
    const next = placeAt(station, t + dt);
    return [(next.p[0] - here.p[0]) / dt, (next.p[1] - here.p[1]) / dt];
  };

  return {
    ends,
    joinsAt: (t) =>
      t >= (joinedFromStart ? 0 : INTO_BEATS) && t <= beats - OPEN_BEATS ? joins : [],
    at(station, t) {
      const pair = pairOf[station];
      const self = placeAt(station, t);
      if (!pair) {
        return { p: self.p, facing: self.facing, hands: { L: "down", R: "down" }, amp: 0 };
      }
      const isLark = station === pair.lark;
      const other = placeAt(isLark ? pair.robin : pair.lark, t);
      const lark = isLark ? self : other;
      const robin = isLark ? other : self;
      const into = ramp(t, 0, INTO_BEATS);
      const open = ramp(t, beats - OPEN_BEATS, beats);
      const buzz = into * (1 - open);

      // The outstretched pair of hands: the lark's left in the robin's right,
      // one floor point, `handOffset` in from the midpoint of the two joined
      // shoulders.
      // M5's offset, to the left of the line from the lark to the robin.
      const outward = leftOf(bearing(lark.p, robin.p));
      const joinedPoint = addScaled(joinPoint(lark, "L", robin, "R"), outward, params.handOffset);
      const joined = joinedHands(ctx, pair.lark, pair.robin, joinedPoint, SWING_HAND_DROP_PX);
      const mineJoined = joined[station];
      if (!mineJoined) throw new Error(`swing: no joined hand for "${station}"`);

      // The other two hands are on the partner's back and shoulder: two
      // points, never one, because they are not joined.
      const free: Hand = isLark
        ? {
            p: bodyPoint(robin.p, robin.facing, BACK_HAND_FORWARD_PX, BACK_HAND_RIGHT_PX),
            drop: BACK_HAND_DROP_PX,
          }
        : {
            p: bodyPoint(lark.p, lark.facing, 0, SHOULDER_WIDTH_PX / 2 - SHOULDER_HAND_INSET_PX),
            drop: 0,
          };

      const side = isLark ? "L" : "R";
      const otherSide = isLark ? "R" : "L";
      const down = (s: "L" | "R"): Hand => handDown(self.p, self.facing, s, t, 0);
      // Where the hand comes from: the dancer's hip, unless something before
      // this figure already had it somewhere else and said so.
      const start = (s: "L" | "R"): Hand => hands.from?.(station, s) ?? down(s);
      const take = (target: Hand, s: "L" | "R"): Hand =>
        lerpHand(lerpHand(start(s), target, into), down(s), open);
      // A hand that was already joined is not taken at all: it simply is
      // where the swing holds it, until the pair opens out and lets go.
      const keepJoined = (target: Hand, s: "L" | "R"): Hand => lerpHand(target, down(s), open);

      return {
        p: self.p,
        facing: self.facing,
        lean: -SWING_LEAN_PX * buzz,
        stepRate: BUZZ_STEPS_PER_BEAT,
        flare: SWING_FLARE_PX * trapezoidSpeed(t, 0, 1.2, beats - 1.6, beats - 0.3),
        amp: 1 - buzz,
        feet: swingFeet(t, self.facing, velocityAt(station, t), buzz),
        look: bearing(self.p, other.p),
        hands: {
          // A hold carried in over a figure boundary is not taken at all:
          // the seam is already moving it from where the figure before had
          // it. One handed in from inside the same figure — the balance half
          // of a `balance-and-swing` — comes through `hands.from` instead,
          // and the take carries it from there to the swing's own hold.
          [side]: carriedIn ? keepJoined(mineJoined, side) : take(mineJoined, side),
          [otherSide]: take(free, otherSide),
        } as { L: Hand | "down"; R: Hand | "down" },
      };
    },
  };
}

/** What one swinging pair needs to know about itself. */
interface SwingPair {
  lark: StationId;
  robin: StationId;
  centre: Vec2;
  endFacing: Angle;
  half: number;
  psi0: Angle;
  /** How far the turn actually goes: `turns`, rounded to open out cleanly. */
  turn: Angle;
}

/** The step the velocity for the feet is differenced over; M5's number. */
const SAMPLE_DT: Beat = 0.05;

/** Half the distance between the two stations a pair belongs to. */
export function stationHalf(stations: readonly Station[], a: StationId, b: StationId): number {
  return dist(stationById(stations, a).p, stationById(stations, b).p) / 2;
}

/**
 * How far from `centre` a figure for two should leave its dancers, so that it
 * leaves them on the formation's own places.
 *
 * A pair that has closed up to balance, or come together to turn, must open out
 * on to places the next figure can start from — and those are the stations, not
 * whatever spacing the pair happens to be at. This looks for the pair of
 * stations that lies square across `facing` with its midpoint nearest `centre`,
 * and answers half the distance between them; with nothing suitable it falls
 * back to `fallback`, the pair's own separation.
 */
export function placeHalf(
  stations: readonly Station[],
  centre: Vec2,
  facing: Angle,
  fallback: number,
): number {
  const axis = dirOf(facing + 90);
  let best = fallback;
  let bestGap = Infinity;
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i]!.p;
      const b = stations[j]!.p;
      const span = dist(a, b);
      if (span < 1e-9) continue;
      const unit: Vec2 = [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
      if (Math.abs(unit[0] * axis[0] + unit[1] * axis[1]) < 0.99) continue;
      const gap = dist([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], centre);
      if (gap < bestGap) {
        bestGap = gap;
        best = span / 2;
      }
    }
  }
  return best;
}

/**
 * Which way a pair faces when a figure for two opens out.
 *
 * `'across'` is square to the line the pair stands on, pointing at the middle
 * of the set; `'up'` and `'down'` are along the frame's own axis. A pair that
 * stands square across the set has no unambiguous `'across'`, and says so.
 */
export function endFacingOf(want: EndFacing, a: Vec2, b: Vec2, centre: Vec2): Angle {
  if (typeof want === "number") return want;
  if (want === "down") return 90;
  if (want === "up") return 270;
  const along = bearing(a, b);
  const toMiddle: Vec2 = [0 - centre[0], 0];
  const candidate = dirOf(along + 90);
  const dot = candidate[0] * toMiddle[0] + candidate[1] * toMiddle[1];
  if (Math.abs(dot) < 1e-6) {
    throw new Error(
      `swing: "across" is ambiguous for a pair standing square across the set; say "up" or "down"`,
    );
  }
  return dot > 0 ? along + 90 : along - 90;
}
