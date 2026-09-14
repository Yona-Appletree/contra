import type { Beat } from "@caller/core";
import { addScaled, angleDiff, dirOf, lerp, smooth } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraParams, FigurePlan, PlanContext, Spot, Spots } from "./ContraFigure.js";
import { bearing, contraFigure } from "./ContraFigure.js";
import { handDown } from "../pair/PairFrame.js";
import { ringFor, ringShift } from "./ring.js";

/** {@link petronella}'s parameters. */
export interface PetronellaParams extends ContraParams {
  /** How many places round the ring, to the dancer's own right. */
  places: number;
  /** How many whole turns the body spins on the way. */
  spins: number;
  /**
   * How far the travelling path bows outward from the straight line between
   * the two places, px.
   *
   * A petronella walks round the set, not round a circle through its corners.
   * Riding the circle through both places bulges `R(1 − cos(arc / 2))` beyond
   * the set — 8.9 px for a quarter turn of a duple improper minor set, which
   * is most of the 20 px between one minor set and the next, and puts two
   * adjacent sets' dancers 2.3 px apart (AC6 wants 8). The chord with a small
   * bow is both what a dancer walks and what keeps the set to itself.
   */
  bowPx: number;
}

/**
 * Petronella: let go, spin to your right, and land on the next place round the
 * ring, facing the middle.
 *
 * It takes whoever's place is one to the right — the ring the dancers are
 * standing on right now, so a balance of the ring lands them on the ring and a
 * petronella from the stations lands them on the stations.
 */
export const petronella = contraFigure<PetronellaParams>({
  id: "petronella",
  call: "PETRONELLA TURN",
  lead: 4,
  beats: 4,
  defaults: { from: {}, places: 1, spins: 1, bowPx: 3 },

  plan(ctx: PlanContext, params: PetronellaParams): FigurePlan {
    const ring = ringFor(ctx);
    const beats = params.beats;
    const ends: Spots = {};
    for (const id of ctx.ids) {
      // One place to the dancer's own right is one place back round the ring,
      // because the ring's order runs the way a circle left travels.
      const to = ctx.spot(ringShift(ring, id, -params.places));
      ends[id] = { p: to.p, facing: bearing(to.p, ring.centre) };
    }

    const placeAt = (station: StationId, t: Beat): Spot => {
      const start = ctx.spot(station);
      const end = ends[station] ?? start;
      const k = smooth(t / beats);
      // Walk the chord between the two places, bowed a little away from the
      // middle so the path is a rounded square rather than either a circle
      // through the corners or a flat line. See `bowPx`.
      const straight = lerp(start.p, end.p, k);
      const bow = params.bowPx * Math.sin(Math.PI * k);
      const p =
        bow === 0 ? straight : addScaled(straight, dirOf(bearing(ring.centre, straight)), bow);
      // The body spins to the dancer's own right, which is clockwise.
      const spin =
        360 * params.spins * Math.sign(params.places || 1) + angleDiff(start.facing, end.facing);
      return { p, facing: start.facing + spin * k };
    };

    return {
      ends,
      joinsAt: () => [],
      at(station, t) {
        const self = placeAt(station, t);
        return {
          p: self.p,
          facing: self.facing,
          hands: {
            L: handDown(self.p, self.facing, "L", t, 0),
            R: handDown(self.p, self.facing, "R", t, 0),
          },
          flare: 2.6 * Math.sin(Math.PI * (t / beats)),
        };
      },
    };
  },
});
