import type { Beat, Side } from "@caller/core";
import { armShortfall } from "@caller/core";
import type { PairFrame, PairRole } from "./PairFrame.js";
import { PAIR_ROLES } from "./PairFrame.js";
import type { FigureDef } from "./FigureDef.js";
import { resolveParams, sampleVelocity } from "./FigureDef.js";

// The one-pose probe is `@caller/core`'s: it needs nothing but a pose, and the
// library figures in `../figures/` check themselves with the same numbers. It
// is re-exported here, with its `ReachCheck`, under the names every figure test
// already imports.
export type { ReachCheck } from "@caller/core";
export { armShortfall };

/** The worst shortfall a figure produces, and where. */
export interface FigureProbe {
  short: number;
  beat: Beat;
  role: PairRole;
  side: Side;
}

const SIDES: readonly Side[] = ["L", "R"];

/**
 * Walk a whole figure at `step`-beat intervals and return the worst arm
 * shortfall over both dancers. Plan AC1 wants this to be exactly 0; every
 * figure's own test asserts it, and M8's figures can use the same probe.
 */
export function worstShortfall<P extends object>(
  def: FigureDef<P>,
  frame: PairFrame,
  params?: Partial<P>,
  step = 1 / 8,
): FigureProbe {
  const resolved = resolveParams(def, params);
  const beats = def.beatsOf === undefined ? def.beats : def.beatsOf(resolved);
  let worst: FigureProbe = { short: 0, beat: 0, role: "lark", side: "L" };
  for (let n = 0; n * step <= beats + 1e-9; n++) {
    const beat = n * step;
    for (const role of PAIR_ROLES) {
      const { pose, velocity } = sampleVelocity(
        (u) => def.sample(frame, role, u, resolved),
        beat,
        beats,
      );
      const check = armShortfall(pose, beat, velocity);
      for (const side of SIDES) {
        if (check[side] > worst.short) worst = { short: check[side], beat, role, side };
      }
    }
  }
  return worst;
}
