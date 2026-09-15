import type { Angle, Vec2 } from "@caller/core";
import { dirOf, dist } from "@caller/core";
import type { FigureRole } from "../FigureDefinition.js";

/**
 * **The formation's own places**, and how a gatherer finds the ones it wants.
 *
 * `ends: "home"` means a figure reads its end places off the formation instead
 * of guessing them. Resolution hands the instance `params.places`: the home
 * points of the lattice, in the frame's own px, for every dancer of the group
 * the call resolved in. What a shape does with them is its own business —
 * a pair opening out square wants *a pair of places square across the way it
 * faces*, a ring wants *one place each* — and this file is the two searches.
 *
 * ### Why not simply "each dancer's own slot point"
 *
 * That is the reading the milestone brief gives, and Butter disproves it. Its
 * A1 is `circle left 3/4, neighbor swing`, in **becket**, where a neighbour is
 * the dancer straight across the set: the two of them have home slots 32 px
 * apart on opposite lines. A swing that put each of them on their own slot
 * would end with the pair on opposite sides of the set rather than side by side
 * — and `pnpm dance butter` catches it as two larks standing in the same place,
 * 0.000 px apart, at every line length.
 *
 * What a swing really does is settle on to **the nearest two places that suit
 * it**, whoever's they are; that is what makes "balance and swing your
 * neighbour" the progression. So a gatherer asks the formation for places, not
 * for its own dancers' places, and the `endHalf: 10` Butter used to carry was a
 * hand-written answer to exactly this search.
 */

/** A pair of the formation's places, and where they sit. */
export interface PlacePair {
  /** Half way between the two, frame-local px. */
  centre: Vec2;
  /** Half the distance between them, px. */
  half: number;
}

/**
 * The two places square across `facing` whose midpoint is nearest `centre`.
 *
 * This is `placeHalf`'s own search — the one the coded swing and allemande do
 * over the group's stations — answering with the **midpoint** as well as the
 * half-distance. The midpoint is the half that was missing: the coded figures
 * opened out `half` px either side of wherever the pair happened to meet, so a
 * pair left diagonal by a hey opened out diagonally, off the places, and a
 * dance had to write `endHalf` by hand to keep the spacing sane.
 */
export function placePairFor(
  places: readonly Vec2[],
  centre: Vec2,
  facing: Angle,
  fallbackHalf: number,
): PlacePair {
  const axis = dirOf(facing + 90);
  let best: PlacePair = { centre, half: fallbackHalf };
  let bestGap = Infinity;
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const a = places[i]!;
      const b = places[j]!;
      const span = dist(a, b);
      if (span < 1e-9) continue;
      const unit: Vec2 = [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
      // Square across the way the pair will face, to within a degree or so.
      if (Math.abs(unit[0] * axis[0] + unit[1] * axis[1]) < 0.99) continue;
      const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const gap = dist(mid, centre);
      if (gap < bestGap) {
        bestGap = gap;
        best = { centre: mid, half: span / 2 };
      }
    }
  }
  return best;
}

/**
 * Which place each role takes, so that the total distance walked is least.
 *
 * "Nobody crosses anybody on the way home". It is the identity when the shape
 * already ends on the places, which is what makes a gatherer from the stations
 * agree with the coded figure it replaced exactly (DD21).
 *
 * Every instance in this milestone casts two dancers or four, so trying every
 * permutation is the honest thing rather than importing an assignment algorithm
 * for a problem of size four. It refuses anything bigger by name.
 */
export function nearestPlaces(
  natural: readonly Vec2[],
  places: readonly Vec2[],
): Array<Vec2 | undefined> {
  const n = natural.length;
  if (n > 4) throw new Error(`settling on to places is written for up to four dancers, not ${n}`);
  if (places.length < n) return natural.map(() => undefined);
  let best: number[] | undefined;
  let bestCost = Infinity;
  for (const choice of choices(places.length, n)) {
    let cost = 0;
    for (let i = 0; i < n; i++) cost += dist(natural[i]!, places[choice[i]!]!);
    if (cost < bestCost - 1e-12) {
      bestCost = cost;
      best = choice;
    }
  }
  return best === undefined ? natural.map(() => undefined) : best.map((at) => places[at]!);
}

/** Every ordered choice of `k` distinct indices out of `n`. */
function choices(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  const out: number[][] = [];
  for (const rest of choices(n, k - 1)) {
    for (let i = 0; i < n; i++) {
      if (rest.includes(i)) continue;
      out.push([...rest, i]);
    }
  }
  return out;
}

/** A role-keyed map of natural end points, settled on to the formation's places. */
export function settleOnPlaces(
  roles: readonly FigureRole[],
  natural: Readonly<Record<FigureRole, Vec2>>,
  places: readonly Vec2[],
): Record<FigureRole, Vec2> {
  const taking = roles.filter((role) => natural[role] !== undefined);
  const chosen = nearestPlaces(
    taking.map((role) => natural[role]!),
    places,
  );
  const out: Record<FigureRole, Vec2> = { ...natural };
  taking.forEach((role, i) => {
    const place = chosen[i];
    if (place) out[role] = place;
  });
  return out;
}
