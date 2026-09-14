import type { Beat } from "@caller/core";
import { angleDiff, dist, mix, smooth } from "@caller/core";
import type { StationId } from "@caller/choreo";
import type { ContraParams, FigurePlan, PlanContext, Spot, Spots } from "./ContraFigure.js";
import { bearing, contraFigure, polar } from "./ContraFigure.js";
import { handDown } from "../pair/PairFrame.js";
import { ringFor, ringShift } from "./ring.js";

/** {@link petronella}'s parameters. */
export interface PetronellaParams extends ContraParams {
  /** How many places round the ring, to the dancer's own right. */
  places: number;
  /** How many whole turns the body spins on the way. */
  spins: number;
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
  defaults: { from: {}, places: 1, spins: 1 },

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
      const from = bearing(ring.centre, start.p);
      const raw = angleDiff(from, bearing(ring.centre, end.p));
      // Round the ring clockwise, which is to the dancer's own right.
      const arc = raw > 0 ? raw - 360 : raw;
      const radius = mix(dist(ring.centre, start.p), dist(ring.centre, end.p), k);
      const spin = 360 * params.spins * Math.sign(params.places || 1) + angleDiff(start.facing, end.facing);
      return { p: polar(ring.centre, from + arc * k, radius), facing: start.facing + spin * k };
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
