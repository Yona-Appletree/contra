import type { Beat, Hand, PoseSample, Side, Style, Vec2 } from "@caller/core";
import { NEUTRAL_STYLE, q256Vec2, quietMotion, shouldersAt, solveArm } from "@caller/core";
import type { PairFrame, PairRole } from "../pair/PairFrame.js";
import { PAIR_ROLES, handDown } from "../pair/PairFrame.js";
import type { FigureDef } from "./FigureDef.js";
import { resolveParams, sampleVelocity } from "./FigureDef.js";

/** How far each arm falls short of its hand, in px. Zero is the AC1 invariant. */
export interface ReachCheck {
  L: number;
  R: number;
}

/**
 * The planar shortfall of both arms for one pose, solved exactly the way
 * `@caller/hall` solves it: the body position quantised, the shoulders hung off
 * the **swayed** torso, and a `'down'` hand resolved to where it hangs.
 *
 * Plan AC1 is `short === 0` for every dancer at every eighth of a beat, so
 * every figure's test runs this over its whole length. A non-zero result means
 * a hand has been put where the arm cannot reach it, which is the one thing
 * the model is not allowed to do.
 */
export function armShortfall(
  pose: PoseSample,
  beat: Beat,
  velocity: Vec2,
  style: Style = NEUTRAL_STYLE,
): ReachCheck {
  const motion = quietMotion(pose, beat, velocity, style);
  const p = q256Vec2(pose.p);
  const torsoAngle = pose.facing + motion.sway;
  const sh = shouldersAt(p, torsoAngle);
  const resolve = (side: Side): Hand => {
    const h = pose.hands[side];
    return h === "down" ? handDown(p, pose.facing, side, beat, pose.amp) : h;
  };
  return {
    L: solveArm(sh.L, resolve("L"), "L", torsoAngle).short,
    R: solveArm(sh.R, resolve("R"), "R", torsoAngle).short,
  };
}

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
