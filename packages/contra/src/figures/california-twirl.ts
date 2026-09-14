import type { Beat, Hand, Side, Vec2 } from "@caller/core";
import { dirOf, smooth, sub } from "@caller/core";
import type { StationId } from "@caller/choreo";
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
  holdWindow,
  isHeld,
  joinPoint,
  joinedHands,
  midpoint,
  polar,
  takeAndRelease,
} from "./ContraFigure.js";
import type { Pairing } from "./pairing.js";
import { mustPair, pairsOf } from "./pairing.js";

/** {@link californiaTwirl}'s parameters. */
export interface CaliforniaTwirlParams extends ContraParams {
  /** Whose places trade. */
  pairs: Pairing;
  /** How far below shoulder height the arch is, px. `0` is shoulder height. */
  holdDrop: number;
}

/**
 * California twirl: the couple trades places under a raised arch and comes out
 * facing the other way.
 *
 * The pair turns as one about the point between them, so the arch — their two
 * joined inside hands — stays one floor point over that centre and both bodies
 * come round with it. Half a turn later they have swapped sides and reversed,
 * which is what the figure is for.
 */
export const californiaTwirl = contraFigure<CaliforniaTwirlParams>({
  id: "california-twirl",
  call: "CALIFORNIA TWIRL",
  lead: 4,
  beats: 4,
  defaults: { from: {}, pairs: "partners", holdDrop: 0 },

  plan(ctx: PlanContext, params: CaliforniaTwirlParams): FigurePlan {
    const beats = params.beats;
    const window = holdWindow(beats, 1, 1);
    const centreOfPair: Record<StationId, Vec2> = {};
    const ends: Spots = {};
    const joins: HandJoin[] = [];

    for (const [a, b] of pairsOf(params.pairs)) {
      const centre = midpoint(ctx.spot(a).p, ctx.spot(b).p);
      centreOfPair[a] = centre;
      centreOfPair[b] = centre;
      ends[a] = { p: ctx.spot(b).p, facing: ctx.spot(a).facing + 180 };
      ends[b] = { p: ctx.spot(a).p, facing: ctx.spot(b).facing + 180 };
      const [sideA, sideB] = insidePair(ctx, a, b);
      joins.push({ a, aSide: sideA, b, bSide: sideB });
    }
    for (const id of ctx.ids) ends[id] ??= ctx.spot(id);

    const placeAt = (station: StationId, t: Beat): Spot => {
      const centre = centreOfPair[station];
      const start = ctx.spot(station);
      if (!centre) return start;
      const k = smooth(t / beats);
      const from = bearing(centre, start.p);
      return {
        p: polar(centre, from + 180 * k, Math.hypot(...sub(start.p, centre))),
        facing: start.facing + 180 * k,
      };
    };

    return {
      ends,
      joinsAt: (t) => (isHeld(window, t) ? joins : []),
      at(station, t) {
        const mate = centreOfPair[station] ? mustPair(params.pairs, station) : undefined;
        const self = placeAt(station, t);
        if (mate === undefined) {
          return { p: self.p, facing: self.facing, hands: { L: "down", R: "down" }, amp: 0 };
        }
        const other = placeAt(mate, t);
        const mySide = insideSide(ctx, station, mate);
        const point = joinPoint(
          mySide === "L" ? self : other,
          "L",
          mySide === "L" ? other : self,
          "R",
        );
        const joined = joinedHands(ctx, station, mate, point, params.holdDrop);
        const mine = joined[station];
        if (!mine) throw new Error(`california-twirl: no joined hand for "${station}"`);
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            [mySide]: takeAndRelease(self, mySide, t, mine, window),
            [mySide === "L" ? "R" : "L"]: "down",
          } as { L: Hand | "down"; R: Hand | "down" },
        };
      },
    };
  },
});

/** Which of a dancer's hands is the one nearest the dancer beside them. */
export function insideSide(ctx: PlanContext, id: StationId, other: StationId): Side {
  const self = ctx.spot(id);
  const toOther = sub(ctx.spot(other).p, self.p);
  const left = dirOf(self.facing - 90);
  return left[0] * toOther[0] + left[1] * toOther[1] > 0 ? "L" : "R";
}

/**
 * The two inside hands of a couple standing side by side: one dancer's left and
 * the other's right.
 *
 * Two dancers facing *each other* have no inside hands — both would give the
 * same one — and a figure for a couple side by side cannot be danced by them.
 * Saying so here is better than a hand placed where an arm cannot reach it.
 */
export function insidePair(ctx: PlanContext, a: StationId, b: StationId): [Side, Side] {
  const sideA = insideSide(ctx, a, b);
  const sideB = insideSide(ctx, b, a);
  if (sideA === sideB) {
    throw new Error(
      `"${a}" and "${b}" are not standing side by side, so they have no inside hands`,
    );
  }
  return [sideA, sideB];
}
