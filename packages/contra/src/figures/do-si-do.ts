import type { Beat, Vec2 } from "@caller/core";
import { dist, mix, ramp } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraParams, FigurePlan, PlanContext, Spot, Spots } from "./ContraFigure.js";
import {
  CLEARANCE_PX,
  bearing,
  contraFigure,
  midpoint,
  orbitRadius,
  polar,
} from "./ContraFigure.js";
import type { Pairing } from "./pairing.js";
import { pairsOf } from "./pairing.js";
import { handDown } from "../pair/PairFrame.js";
import { trapezoid } from "../pair/trapezoid.js";
import { placeHalf } from "./swing.js";

/** {@link doSiDo}'s parameters. */
export interface DoSiDoParams extends ContraParams {
  /** Who goes round whom. */
  pairs: Pairing;
  /** How far round: once, or once and a half to change places. */
  amount: number;
  /** How far the circle bulges at the back-to-back point, px. */
  swellPx: number;
  /** How far from the centre each dancer ends, px. `null` takes it from the formation. */
  endHalf: number | null;
}

/** The arm swing fades up at the start and out at the end, so a seam never jumps. */
const SWING_IN = 0.6;
const SWING_OUT = 0.6;

/**
 * Do-si-do: pass right shoulders, round back to back, and come back — or carry
 * on round and a half to change places.
 *
 * Hands stay down and neither body turns; only the head follows the partner
 * round, which is M5's. The circle is as big as the pair's own places allow,
 * or tighter when the pair beside them would be in the way.
 */
export const doSiDo = contraFigure<DoSiDoParams>({
  id: "do-si-do",
  call: "DO-SI-DO",
  describe:
    "Walk forward and pass right shoulders, slide across back to back without turning, then walk backward to place passing left shoulders. Nobody takes hands and nobody turns around — you face the same way for the whole eight beats. Once round for a plain do-si-do, once and a half where the dance says so.",
  lead: 4,
  beats: 8,
  defaults: { from: {}, pairs: "neighbors", amount: 1, swellPx: 2.5, endHalf: null },

  plan(ctx: PlanContext, params: DoSiDoParams): FigurePlan {
    const beats = params.beats;
    const turn = 360 * params.amount;
    const pairOf: Record<StationId, DoSiDoPair> = {};
    const ends: Spots = {};

    const centres = pairsOf(params.pairs).map(([a, b]) => midpoint(ctx.spot(a).p, ctx.spot(b).p));
    // Whoever this pairing leaves out stands still while the circle goes round
    // them. "Robins right shoulder round once and a half" across a duple
    // improper set is the case: the two robins are 32 px apart, so a circle
    // through both of them has radius 16, and the two larks standing at the
    // corners are 18.87 px from the same centre — 2.9 px outside it, which
    // AC6's 8 px does not allow. The pair therefore walks in and goes round a
    // tighter circle, which is what the dancers do.
    const idle = ctx.ids
      .filter((id) => !pairsOf(params.pairs).some(([a, b]) => a === id || b === id))
      .map((id) => ctx.spot(id).p);

    pairsOf(params.pairs).forEach(([a, b], index) => {
      const centre = centres[index]!;
      const separation = dist(ctx.spot(a).p, ctx.spot(b).p) / 2;
      const half =
        params.endHalf ??
        placeHalf(ctx.stations, centre, bearing(ctx.spot(a).p, ctx.spot(b).p) + 90, separation);
      // As big a circle as the pair's own places allow, tightened — swell
      // first, then the radius — until the pair beside them, and anybody
      // standing still, has room.
      const allowed = Math.min(
        orbitRadius(Number.POSITIVE_INFINITY, centre, centres),
        ...idle.map((p) => dist(centre, p) - CLEARANCE_PX),
      );
      const radius = Math.min(dist(ctx.spot(a).p, ctx.spot(b).p) / 2, allowed);
      const pair: DoSiDoPair = {
        centre,
        half,
        radius,
        swell: Math.min(params.swellPx, Math.max(0, allowed - radius)),
      };
      pairOf[a] = pair;
      pairOf[b] = pair;
      for (const id of [a, b]) {
        ends[id] = {
          p: polar(centre, bearing(centre, ctx.spot(id).p) + turn, half),
          facing: ctx.spot(id).facing,
        };
      }
    });
    for (const id of ctx.ids) ends[id] ??= ctx.spot(id);

    const placeAt = (station: StationId, t: Beat): Spot => {
      const pair = pairOf[station];
      const start = ctx.spot(station);
      if (!pair) return start;
      const f = trapezoid(t, 0, 0.9, beats - 0.9, beats);
      const from = dist(pair.centre, start.p);
      const swell = pair.swell * Math.sin(Math.PI * f);
      const radius =
        mix(mix(from, pair.radius, ramp(t, 0, 1)), pair.half, ramp(t, beats - 1, beats)) + swell;
      return {
        p: polar(pair.centre, bearing(pair.centre, start.p) + turn * f, radius),
        facing: start.facing,
      };
    };

    return {
      ends,
      joinsAt: () => [],
      at(station, t) {
        const self = placeAt(station, t);
        const pair = pairOf[station];
        const swing = ramp(t, 0, SWING_IN) * (1 - ramp(t, beats - SWING_OUT, beats));
        return {
          p: self.p,
          facing: self.facing,
          look: pair ? bearing(self.p, opposite(self.p, pair.centre)) : self.facing,
          hands: {
            L: handDown(self.p, self.facing, "L", t, swing),
            R: handDown(self.p, self.facing, "R", t, swing),
          },
        };
      },
    };
  },
});

/** What one do-si-do pair needs to know about itself. */
interface DoSiDoPair {
  centre: Vec2;
  half: number;
  radius: number;
  /** How far the circle may bulge without crowding the pair beside them, px. */
  swell: number;
}

/** The point opposite `p` through `centre`: where the partner is, on the same circle. */
const opposite = (p: Vec2, centre: Vec2): Vec2 => [2 * centre[0] - p[0], 2 * centre[1] - p[1]];
