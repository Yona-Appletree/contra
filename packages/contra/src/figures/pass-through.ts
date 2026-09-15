import { dirOf, leftOf, sub } from "@caller/core";
import type { StationId } from "@caller/choreo";
import { DEFAULT_BOW_PX } from "@caller/choreo";
import type { ContraParams, FigurePlan, PlanContext, Spots } from "./ContraFigure.js";
import { bearing, centreOf, contraFigure, passRight } from "./ContraFigure.js";

/** {@link passThrough}'s parameters. */
export interface PassThroughParams extends ContraParams {
  /** Whether the dancers pass the one across the set or the one along it. */
  direction: "across" | "along";
  /** How far each dancer bows to their own left so they pass right shoulders, px. */
  bowPx: number;
}

/**
 * Pass through: walk past the dancer opposite and keep going, right shoulders.
 *
 * `'across'` pairs each dancer with the one across the set, `'along'` with the
 * one up or down the line. The pairs come out of where the dancers actually
 * stand, so the same figure passes a becket line through and a duple improper
 * line along without either being written down.
 */
export const passThrough = contraFigure<PassThroughParams>({
  id: "pass-through",
  call: "PASS THROUGH",
  describe:
    "Walk forward past the dancer opposite you, passing right shoulders, and stop on the other side without turning round. Four beats. Whatever comes next is what tells you which way to face.",
  lead: 4,
  beats: 4,
  defaults: { from: {}, direction: "across", bowPx: DEFAULT_BOW_PX },

  plan(ctx: PlanContext, params: PassThroughParams): FigurePlan {
    const opposite = facingPairs(ctx, params.direction);
    const ends: Spots = {};
    for (const id of ctx.ids) {
      const other = opposite[id];
      if (other === undefined) throw new Error(`pass-through: nobody opposite "${id}"`);
      const to = ctx.spot(other).p;
      ends[id] = { p: to, facing: bearing(ctx.spot(id).p, to) };
    }

    return {
      ends,
      joinsAt: () => [],
      at(station, t) {
        const end = ends[station];
        if (!end) throw new Error(`pass-through: no end for station "${station}"`);
        const step = passRight(ctx.spot(station), end, t, params.beats, params.bowPx);
        return {
          p: step.p,
          facing: step.facing,
          hands: { L: "down", R: "down" },
          stepRate: step.moving ? 1 : 0,
          amp: step.moving ? 1 : 0,
        };
      },
    };
  },
});

/**
 * Who is straight in front of each dancer: the one they would walk into.
 *
 * `facingPairs` asks which way the set lies; this asks which way the *dancers*
 * are looking, which is what a caller means by "pass the one you are facing".
 * In duple improper the ones face the twos along the line, so `1L`'s is `2R`,
 * 20 px straight ahead of him; in becket everyone faces across, so it is the
 * dancer opposite. Nobody behind you counts, however near.
 */
export function aheadPairs(ctx: PlanContext): Record<StationId, StationId> {
  const out: Record<StationId, StationId> = {};
  for (const id of ctx.ids) {
    const self = ctx.spot(id);
    const ahead = dirOf(self.facing);
    const beside = leftOf(self.facing);
    let best: StationId | undefined;
    let bestOff = Infinity;
    for (const candidate of ctx.ids) {
      if (candidate === id) continue;
      const to = sub(ctx.spot(candidate).p, self.p);
      if (to[0] * ahead[0] + to[1] * ahead[1] <= 0) continue;
      const off = Math.abs(to[0] * beside[0] + to[1] * beside[1]);
      if (off < bestOff) {
        bestOff = off;
        best = candidate;
      }
    }
    if (best === undefined) throw new Error(`nobody in front of "${id}"`);
    out[id] = best;
  }
  return out;
}

/**
 * Who each dancer passes: the dancer on the other side of the set (`'across'`)
 * or the one up or down the line (`'along'`), by which way they lie from each
 * other on the floor.
 */
export function facingPairs(
  ctx: PlanContext,
  direction: "across" | "along",
  partial = false,
): Record<StationId, StationId> {
  const centre = centreOf(ctx.ids.map((id) => ctx.spot(id)));
  const axis = direction === "across" ? 0 : 1;
  const other = axis === 0 ? 1 : 0;
  const out: Record<StationId, StationId> = {};
  for (const id of ctx.ids) {
    const self = ctx.spot(id).p;
    let best: StationId | undefined;
    let bestGap = Infinity;
    for (const candidate of ctx.ids) {
      if (candidate === id) continue;
      const p = ctx.spot(candidate).p;
      // Opposite along the chosen axis, and as close as possible on the other.
      if ((p[axis] - centre[axis]) * (self[axis] - centre[axis]) >= 0) continue;
      const gap = Math.abs(p[other] - self[other]);
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    // **A pairing may leave somebody out** (`kinds/pairing.ts`'s own promise,
    // and M8b's ruling on the line mates): two dancers a call names who are not
    // on opposite sides of the set are not a pass, and standing them still is a
    // measurement the collision and coverage oracles can report where a stack
    // trace is not. Jeremy Corners' second pass is where it was measured — the
    // neighbour swing that ends its first pass leaves the twos side by side on
    // one line at four couples and up, so "twos pass through across" names a
    // pair with nobody across. The **coded** figure keeps the throw, because it
    // is handed the whole hands-four and a hands-four always has an opposite.
    if (best === undefined) {
      if (partial) continue;
      throw new Error(`pass-through: nobody opposite "${id}"`);
    }
    out[id] = best;
  }
  return out;
}
