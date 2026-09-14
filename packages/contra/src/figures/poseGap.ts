import type { Hand, PoseSample } from "@caller/core";
import { angleDiff, dist } from "@caller/core";

/**
 * How far apart two poses are, field by field, in px and degrees. Used to
 * check that a figure's end pose is the next figure's start pose, so the
 * sequence closes without the seam having to hide a jump.
 *
 * `stepRate` and `amp` are deliberately not compared: both are rates, not
 * positions, and both have no visible effect at a figure boundary, where the
 * dancers are momentarily still and the step phase is exactly zero. Everything
 * that ends up as a pixel is here.
 */
export interface PoseGap {
  /** Body centre, px. */
  p: number;
  /** Facing, degrees, shortest arc. */
  facing: number;
  /** Head direction, degrees, shortest arc. */
  look: number;
  /** Lean, px. */
  lean: number;
  /** Worst of the two hands' floor points, px. `Infinity` if one is `'down'` and the other is not. */
  hands: number;
  /** Worst of the two hands' drops, px. */
  drops: number;
  /** Worst of the two feet, px; 0 when neither pose places its feet. */
  feet: number;
  /** The largest of the above, for a single assertion. */
  worst: number;
}

export function poseGap(a: PoseSample, b: PoseSample): PoseGap {
  const handGaps = (["L", "R"] as const).map((side) => handGap(a.hands[side], b.hands[side]));
  const gap: Omit<PoseGap, "worst"> = {
    p: dist(a.p, b.p),
    facing: Math.abs(angleDiff(a.facing, b.facing)),
    look: Math.abs(angleDiff(a.look, b.look)),
    lean: Math.abs(a.lean - b.lean),
    hands: Math.max(...handGaps.map((g) => g.p)),
    drops: Math.max(...handGaps.map((g) => g.drop)),
    feet: feetGap(a, b),
  };
  return { ...gap, worst: Math.max(...Object.values(gap)) };
}

function handGap(a: Hand | "down", b: Hand | "down"): { p: number; drop: number } {
  if (a === "down" || b === "down") {
    return a === b ? { p: 0, drop: 0 } : { p: Infinity, drop: Infinity };
  }
  return { p: dist(a.p, b.p), drop: Math.abs(a.drop - b.drop) };
}

function feetGap(a: PoseSample, b: PoseSample): number {
  if (a.feet === undefined || b.feet === undefined) return 0;
  return Math.max(dist(a.feet.L, b.feet.L), dist(a.feet.R, b.feet.R));
}
