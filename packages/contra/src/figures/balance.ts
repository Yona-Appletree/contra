import type { Beat, Hand, Side, Vec2 } from "@caller/core";
import { addScaled, angleLerp, dirOf, dist, lerp, ramp } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type {
  ContraFigure,
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
  holdWindow,
  isHeld,
  joinPoint,
  joinedHands,
  midpoint,
  takeAndRelease,
} from "./ContraFigure.js";
import type { Pairing } from "./pairing.js";
import { mustPair, pairsOf } from "./pairing.js";
import { ringFor, ringHands } from "./ring.js";
import { BALANCE_BACK_RATIO, BALANCE_LEAN_CAP, balanceRock } from "../pair/balance.js";

/** {@link balance}'s parameters. */
export interface BalanceParams extends ContraParams {
  /** How far the body rocks forward, px. M5's gate-3 number is the default. */
  rock: number;
  /** What the dancers hold: two hands, one hand, hands round the ring, or nothing. */
  hold: "two" | "one" | "ring" | "none";
  /** Which hand, when `hold` is `'one'`. */
  hand: Side;
  /** Who balances with whom, when `hold` is not `'ring'`. */
  pairs: Pairing;
  /** How far below shoulder height the joined hands sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
}

/** At full forward rock the joined hands spread this much wider and drop this much lower. */
const HAND_SPREAD_PX = 2;
const HAND_DROP_PX = 3;
/** At full back rock they rise this much. */
const HAND_RISE_PX = 1;

/** Beats spent closing to the hold, and the window the hands are up. */
const CLOSE_BEATS = 1.2;
const TAKE_TO = 1.4;

/**
 * Balance: take hands, rock forward and rock back.
 *
 * The rock is M5's, beat for beat, including its slightly longer back rock and
 * its lean cap. What is new is the closing: a pair standing in the lines is 32
 * px apart and no 15 px arm reaches half way, so the balance steps in to the
 * frame's hold spacing as it rocks forward — which is what dancers do — and
 * leaves them there for the swing that usually follows.
 *
 * `hold: 'ring'` balances the ring of four instead, everybody's hands joined
 * round it and the rock along the radius.
 */
export const balance: ContraFigure<BalanceParams> = contraFigure<BalanceParams>({
  id: "balance",
  call: "BALANCE",
  lead: 4,
  beats: 4,
  defaults: {
    from: {},
    rock: 1.0,
    hold: "two",
    hand: "R",
    pairs: "neighbors",
    holdDrop: 5,
    stackPx: 1,
  },
  plan: balancePlan,
});

/** Balance the ring: the same rock, with the hands joined all the way round. */
export const balanceRing: ContraFigure<BalanceParams> = contraFigure<BalanceParams>({
  id: "balance-ring",
  call: "BALANCE THE RING",
  lead: 4,
  beats: 4,
  defaults: {
    from: {},
    rock: 1.0,
    hold: "ring",
    hand: "R",
    pairs: "neighbors",
    holdDrop: 6,
    stackPx: 1,
  },
  plan: balancePlan,
});

function balancePlan(ctx: PlanContext, params: BalanceParams): FigurePlan {
  return params.hold === "ring" ? ringBalance(ctx, params) : pairBalance(ctx, params);
}

/** How far the body is off its place at `t`, in px, forward positive. */
const rockAt = (t: Beat, rock: number): number => {
  const f = balanceRock(t);
  return rock * f * (f > 0 ? 1 : BALANCE_BACK_RATIO);
};

/** The lean the rock puts in the torso, capped. */
const leanAt = (t: Beat): number =>
  Math.max(-BALANCE_LEAN_CAP, Math.min(BALANCE_LEAN_CAP, balanceRock(t)));

/** A balance for two: close to the hold spacing, take hands, rock. */
function pairBalance(ctx: PlanContext, params: BalanceParams): FigurePlan {
  const beats = params.beats;
  const window = holdWindow(beats, TAKE_TO, 0);
  const ends: Spots = {};
  const hold: Record<StationId, Spot> = {};

  for (const [a, b] of pairsOf(params.pairs)) {
    const sa = ctx.spot(a);
    const sb = ctx.spot(b);
    const centre = midpoint(sa.p, sb.p);
    const toA = bearing(centre, sa.p);
    hold[a] = { p: addScaled(centre, dirOf(toA), ctx.spacing / 2), facing: toA + 180 };
    hold[b] = { p: addScaled(centre, dirOf(toA), -ctx.spacing / 2), facing: toA };
  }
  for (const id of ctx.ids) ends[id] = hold[id] ?? ctx.spot(id);

  const placeAt = (id: StationId, t: Beat): Spot => {
    const start = ctx.spot(id);
    const end = hold[id] ?? start;
    const k = ramp(t, 0, CLOSE_BEATS);
    const facing = angleLerp(start.facing, end.facing, k);
    return { p: lerp(start.p, end.p, k), facing };
  };

  /** The body, rocked off its place along the way it faces. */
  const bodyAt = (id: StationId, t: Beat): Spot => {
    const place = placeAt(id, t);
    return { p: addScaled(place.p, dirOf(place.facing), rockAt(t, params.rock)), facing: place.facing };
  };

  const joins: HandJoin[] = [];
  for (const [a, b] of pairsOf(params.pairs)) {
    if (params.hold === "two") {
      joins.push({ a, aSide: "L", b, bSide: "R" }, { a, aSide: "R", b, bSide: "L" });
    } else if (params.hold === "one") {
      joins.push({ a, aSide: params.hand, b, bSide: params.hand });
    }
  }

  return {
    ends,
    joinsAt: (t) => (isHeld(window, t) ? joins : []),
    at(station, t) {
      const self = bodyAt(station, t);
      if (params.hold === "none") {
        return {
          p: self.p,
          facing: self.facing,
          lean: leanAt(t),
          hands: { L: "down", R: "down" },
          amp: 0,
        };
      }
      const other = bodyAt(mustPair(params.pairs, station), t);
      const f = balanceRock(t);
      const ahead = Math.max(f, 0);
      const behind = Math.max(-f, 0);
      const drop = params.holdDrop + HAND_DROP_PX * ahead - HAND_RISE_PX * behind;
      const spread = HAND_SPREAD_PX * ahead;

      const handFor = (side: Side): Hand | "down" => {
        if (params.hold === "one" && side !== params.hand) return "down";
        const theirs: Side = side === "L" ? "R" : "L";
        const point =
          params.hold === "one"
            ? midpoint(self.p, other.p)
            : spreadPoint(joinPoint(self, side, other, theirs), self.p, other.p, spread, side);
        const joined = joinedHands(
          ctx,
          station,
          mustPair(params.pairs, station),
          point,
          params.hold === "one" ? 2 : drop,
          params.stackPx,
        );
        const mine = joined[station];
        if (!mine) throw new Error(`balance: no joined hand for "${station}"`);
        return takeAndRelease(self, side, t, mine, window);
      };

      return {
        p: self.p,
        facing: self.facing,
        lean: leanAt(t),
        hands: { L: handFor("L"), R: handFor("R") },
        amp: 0,
      };
    },
  };
}

/** A joined point pushed `spread` px further out to the side as the pair comes together. */
function spreadPoint(p: Vec2, self: Vec2, other: Vec2, spread: number, side: Side): Vec2 {
  if (spread === 0) return p;
  const along = bearing(self, other);
  const out = dirOf(along + (side === "L" ? -90 : 90));
  return addScaled(p, out, spread);
}

/** A balance of the ring: everybody in, everybody out, hands joined round. */
function ringBalance(ctx: PlanContext, params: BalanceParams): FigurePlan {
  const beats = params.beats;
  const window = holdWindow(beats, TAKE_TO, 0);
  const ring = ringFor(ctx);

  const ends: Spots = {};
  for (const id of ctx.ids) {
    const at = ring.angle[id];
    if (at === undefined) throw new Error(`balance-ring: "${id}" is not on the ring`);
    const p = addScaled(ring.centre, dirOf(at), ring.radius);
    ends[id] = { p, facing: at + 180 };
  }

  const placeAt = (id: StationId, t: Beat): Spot => {
    const start = ctx.spot(id);
    const end = ends[id] ?? start;
    const k = ramp(t, 0, CLOSE_BEATS);
    const facing = angleLerp(start.facing, end.facing, k);
    const p = lerp(start.p, end.p, k);
    // The rock runs along the radius: in toward the middle and back out.
    return { p: addScaled(p, dirOf(facing), rockAt(t, params.rock)), facing };
  };

  return {
    ends,
    joinsAt: (t) =>
      isHeld(window, t) ? ringHands(ctx, ring, (id) => placeAt(id, t), params.holdDrop).joins : [],
    at(station, t) {
      const self = placeAt(station, t);
      const { hands } = ringHands(
        ctx,
        ring,
        (id) => placeAt(id, t),
        params.holdDrop - HAND_RISE_PX * Math.max(-balanceRock(t), 0),
        params.stackPx,
      );
      const mine = hands[station];
      if (!mine) throw new Error(`balance-ring: no hands for "${station}"`);
      return {
        p: self.p,
        facing: self.facing,
        lean: leanAt(t),
        hands: {
          L: takeAndRelease(self, "L", t, mine.L, window),
          R: takeAndRelease(self, "R", t, mine.R, window),
        },
        amp: 0,
      };
    },
  };
}

/** How far apart two dancers of a pair stand right now. See {@link balance}. */
export const pairGap = (a: Spot, b: Spot): number => dist(a.p, b.p);
