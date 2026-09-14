import type { Beat, Hand, Vec2 } from "@caller/core";
import { addScaled, angleLerp, dirOf, dist, norm, ramp, sub } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraParams, FigurePlan, HandJoin, PlanContext, Spot, Spots } from "./ContraFigure.js";
import {
  bearing,
  centreOf,
  contraFigure,
  holdWindow,
  isHeld,
  joinPoint,
  joinedHands,
  takeAndRelease,
} from "./ContraFigure.js";

/** {@link longLines}'s parameters. */
export interface LongLinesParams extends ContraParams {
  /** How far into the set each line comes, px. */
  forwardPx: number;
  /** How far below shoulder height the hands along the line sit, px. */
  holdDrop: number;
  /** How much higher the robin's hand sits, px. */
  stackPx: number;
}

/**
 * Long lines forward and back: both lines take hands along the line, walk into
 * the set and walk back out.
 *
 * The hands along the line reach past the group. A dancer's hand toward the
 * next minor set is placed half the line's own pitch beyond them, and the
 * dancer of that set places theirs by the same rule from the other side, so the
 * two land on one floor point without either group knowing the other exists —
 * which is the only way a figure whose frame is one minor set can join hands
 * down a whole line.
 */
export const longLines = contraFigure<LongLinesParams>({
  id: "long-lines",
  call: "LONG LINES FORWARD AND BACK",
  lead: 4,
  beats: 8,
  defaults: { from: {}, forwardPx: 9, holdDrop: 8, stackPx: 1 },

  plan(ctx: PlanContext, params: LongLinesParams): FigurePlan {
    const centre = centreOf(ctx.ids.map((id) => ctx.spot(id)));
    const beats = params.beats;
    const window = holdWindow(beats, 1, 1);

    /** Which side of the set a dancer stands on, and who else is on it. */
    const across = (id: StationId): number => ctx.spot(id).p[0] - centre[0];
    const mateOf = (id: StationId): StationId => {
      const side = across(id);
      const mate = ctx.ids.find((other) => other !== id && across(other) * side > 0);
      if (mate === undefined) throw new Error(`long-lines: station "${id}" has no line mate`);
      return mate;
    };

    /** Facing straight across the set, which is where a long line looks. */
    const facingOf = (id: StationId): number =>
      bearing(ctx.spot(id).p, [centre[0], ctx.spot(id).p[1]]);

    const ends: Spots = {};
    for (const id of ctx.ids) ends[id] = { p: ctx.spot(id).p, facing: facingOf(id) };

    /** In over the first half and out over the second, still at both ends. */
    const forwardAt = (t: Beat): number =>
      (params.forwardPx * (1 - Math.cos((2 * Math.PI * t) / beats))) / 2;

    const placeAt = (id: StationId, t: Beat): Spot => {
      const facing = facingOf(id);
      return {
        p: addScaled(ctx.spot(id).p, dirOf(facing), forwardAt(t)),
        facing: angleLerp(ctx.spot(id).facing, facing, ramp(t, 0, 1)),
      };
    };

    const joins: HandJoin[] = [];
    const seen = new Set<StationId>();
    for (const id of ctx.ids) {
      const mate = mateOf(id);
      if (seen.has(mate)) continue;
      seen.add(id);
      joins.push({ a: id, aSide: sideToward(ctx, id, mate), b: mate, bSide: sideToward(ctx, mate, id) });
    }

    return {
      ends,
      joinsAt: (t) => (isHeld(window, t) ? joins : []),
      at(station, t) {
        const self = placeAt(station, t);
        const mate = mateOf(station);
        const other = placeAt(mate, t);
        const inside = sideToward(ctx, station, mate);
        const outside = inside === "L" ? "R" : "L";

        // The hand toward the line mate: one point, the midpoint of the two
        // shoulders, computed the same way by both dancers.
        const insidePoint = joinPoint(
          inside === "L" ? self : other,
          "L",
          inside === "L" ? other : self,
          "R",
        );
        const insideHands = joinedHands(
          ctx,
          station,
          mate,
          insidePoint,
          params.holdDrop,
          params.stackPx,
        );
        // The hand toward the next minor set: half the line's pitch beyond,
        // which is where that set's dancer puts theirs.
        const away = norm(sub(self.p, other.p));
        const outsidePoint: Vec2 = addScaled(self.p, away, dist(self.p, other.p) / 2);
        const mine = insideHands[station];
        if (!mine) throw new Error(`long-lines: no joined hand for "${station}"`);
        const outsideHand: Hand = { p: outsidePoint, drop: params.holdDrop };

        return {
          p: self.p,
          facing: self.facing,
          hands: {
            [inside]: takeAndRelease(self, inside, t, mine, window),
            [outside]: takeAndRelease(self, outside, t, outsideHand, window),
          } as { L: Hand | "down"; R: Hand | "down" },
        };
      },
    };
  },
});

/** Which hand of `id` points at `other` once both have turned across the set. */
function sideToward(ctx: PlanContext, id: StationId, other: StationId): "L" | "R" {
  const centre = centreOf(ctx.ids.map((s) => ctx.spot(s)));
  const self = ctx.spot(id).p;
  const facing = bearing(self, [centre[0], self[1]]);
  const toOther = sub(ctx.spot(other).p, self);
  const left = dirOf(facing - 90);
  return left[0] * toOther[0] + left[1] * toOther[1] > 0 ? "L" : "R";
}
