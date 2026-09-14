import type { StationId } from "@caller/choreo";
import type { Spot, Spots } from "./ContraFigure.js";
import { bearing, centreOf } from "./ContraFigure.js";

/**
 * Who dances a figure with whom.
 *
 * `@caller/choreo`'s selector answers *which dancers* a call is aimed at; a
 * contra figure for two also needs *who pairs with whom*, which M7 left to this
 * milestone on purpose ("the pairing itself is a figure parameter").
 *
 * Both contra formations happen to name the pairs with the same station ids.
 * In duple improper your partner is across the set and your neighbour is beside
 * you down the line; in becket your partner is beside you and your neighbour is
 * across. Either way `1L` dances with `1R` as partners and with `2R` as
 * neighbours, which is what makes one figure library serve both.
 */
export const PARTNERS: readonly (readonly [StationId, StationId])[] = [
  ["1L", "1R"],
  ["2L", "2R"],
];

/** The neighbour pairs of a minor set. See {@link PARTNERS}. */
export const NEIGHBORS: readonly (readonly [StationId, StationId])[] = [
  ["1L", "2R"],
  ["1R", "2L"],
];

/** A pairing: a named one, or the pairs written out. */
export type Pairing = "partners" | "neighbors" | readonly (readonly [StationId, StationId])[];

/** The pairs a {@link Pairing} names. */
export function pairsOf(pairing: Pairing): readonly (readonly [StationId, StationId])[] {
  if (pairing === "partners") return PARTNERS;
  if (pairing === "neighbors") return NEIGHBORS;
  return pairing;
}

/** Who this station dances with, or `undefined` if the pairing leaves them out. */
export function pairedWith(pairing: Pairing, station: StationId): StationId | undefined {
  for (const [a, b] of pairsOf(pairing)) {
    if (a === station) return b;
    if (b === station) return a;
  }
  return undefined;
}

/** Who this station dances with; throws when the pairing leaves them out. */
export function mustPair(pairing: Pairing, station: StationId): StationId {
  const other = pairedWith(pairing, station);
  if (other === undefined) {
    throw new Error(`no partner for station "${station}" in ${JSON.stringify(pairsOf(pairing))}`);
  }
  return other;
}

/**
 * The stations in ring order: anticlockwise on the floor, which is the way a
 * **circle left** travels.
 *
 * With y increasing downward an angle increases from +x toward +y, so a dancer
 * facing the ring's centre moves to their own left as their angle about the
 * centre increases — the direction this order runs in.
 */
export function ringOrder(spots: Spots, ids: readonly StationId[]): StationId[] {
  const places = ids.map((id) => mustSpot(spots, id));
  const centre = centreOf(places);
  return [...ids].sort(
    (a, b) =>
      wrap360(bearing(centre, mustSpot(spots, a).p)) - wrap360(bearing(centre, mustSpot(spots, b).p)),
  );
}

/** A spot from a map, or a clear error. */
export function mustSpot(spots: Spots, id: StationId): Spot {
  const spot = spots[id];
  if (!spot) throw new Error(`no spot for station "${id}" in [${Object.keys(spots).join(", ")}]`);
  return spot;
}

/** An angle in `[0, 360)`. */
export const wrap360 = (a: number): number => ((a % 360) + 360) % 360;
