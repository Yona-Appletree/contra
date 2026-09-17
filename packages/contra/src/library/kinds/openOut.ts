import type { Angle, Vec2 } from "@caller/core";
import { angleDiff, dirOf, dist } from "@caller/core";
import type { Station } from "@caller/choreo";
import { bearing } from "../../figures/ContraFigure.js";

/**
 * **Opening out on to the set's own places.**
 *
 * A figure for two closes its dancers up — to balance, to turn, to swing — and
 * has to put them back down somewhere. These two answer where and which way
 * round, and they are the arithmetic of the *honest end*: not "back where you
 * met" but "on the places the next figure starts from".
 *
 * Both came out of the coded swing when M11 deleted it (`figures/swing.ts`).
 * They are read by the `orbitPair` and `path` kinds, which is every figure in
 * the library that opens a pair out.
 */

/** Which way a pair faces when a figure for two opens out, in the frame's own axes. */
export type EndFacing = "across" | "up" | "down" | number;

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
 * `"across"` is square to the line the pair stands on, pointing at the middle
 * of the set; `"up"` and `"down"` are the hall's own directions; a number is
 * taken as written. A pair standing *square across the set* has no "middle" to
 * point at — both answers are equally across — and the tie is broken by the way
 * the first dancer is already looking, or refused by name if nobody says.
 */
export function endFacingOf(
  want: EndFacing,
  a: Vec2,
  b: Vec2,
  centre: Vec2,
  facing?: Angle,
): Angle {
  if (typeof want === "number") return want;
  if (want === "down") return 90;
  if (want === "up") return 270;
  const along = bearing(a, b);
  const toMiddle: Vec2 = [0 - centre[0], 0];
  const candidate = dirOf(along + 90);
  const dot = candidate[0] * toMiddle[0] + candidate[1] * toMiddle[1];
  if (Math.abs(dot) < 1e-6) {
    if (facing === undefined) {
      throw new Error(
        `swing: "across" is ambiguous for a pair standing square across the set; say "up" or "down"`,
      );
    }
    return Math.abs(angleDiff(facing, along + 90)) <= 90 ? along + 90 : along - 90;
  }
  return dot > 0 ? along + 90 : along - 90;
}
