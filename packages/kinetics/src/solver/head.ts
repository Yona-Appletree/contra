import { angleDiff, angleOf, dirOf } from "@caller/core";
import { HEIGHTS } from "../body/Body.js";
import type { Vec3 } from "../motion/Vec3.js";
import { ANGULAR_CAPS } from "../units/caps.js";
import { degPerBeat, type Tempo } from "../units/Tempo.js";
import type { LimitedSample } from "./torso.js";

/**
 * The head's yaw, sample by sample. The look is **instructed** and the head is
 * **solved** (DA12): the assembly says who or what a dancer is looking at, and
 * this turns that into an angle a neck can hold.
 *
 * Two limits, both from `ANGULAR_CAPS`: the head may be at most `lookDeg` off
 * the torso (past that a dancer turns their shoulders instead, which is the
 * torso's comfort rule, not the head's), and it may not get there faster than
 * `lookDegPerS`. The yaw is stored **relative to the torso**, so a dancer
 * orbiting while watching their partner has a nearly constant `headYaw`.
 *
 * Pitch is ignored: the views are 2D and nobody has asked for a nod.
 */
export const solveHead = (input: HeadInput): HeadSolution => {
  const { tempo, torsoYawDeg, bearingDeg } = input;
  const capPerSample = degPerBeat(tempo, ANGULAR_CAPS.lookDegPerS) / tempo.samplesPerBeat;
  const headYawDeg: number[] = new Array(torsoYawDeg.length);
  const limited: LimitedSample[] = [];

  for (let i = 0; i < torsoYawDeg.length; i++) {
    const bearing = bearingDeg[i];
    // Nothing to look at: the head sits square on the shoulders. A target the
    // neck cannot reach (behind the shoulder) is given up rather than clamped:
    // clamping flips the head from one shoulder to the other as a partner
    // passes behind, which is the whip the do-si-do's `elseAt: "ahead"` rule
    // exists to avoid — the eyes go ahead until the partner is back in range.
    const off = bearing === undefined ? 0 : angleDiff(torsoYawDeg[i]!, bearing);
    const want = Math.abs(off) <= ANGULAR_CAPS.lookDeg ? off : 0;
    if (i === 0) {
      headYawDeg[0] = want;
      continue;
    }
    const step = want - headYawDeg[i - 1]!;
    if (Math.abs(step) > capPerSample + 1e-9) {
      // The neck turns as fast as it may toward the target; `limited` records
      // where it lagged, for the debugger, and is not a violation — a look is
      // a wish, and the neck's rate is the neck's to keep.
      limited.push({ sample: i, value: Math.abs(step), cap: capPerSample });
      headYawDeg[i] = headYawDeg[i - 1]! + Math.sign(step) * capPerSample;
    } else {
      headYawDeg[i] = want;
    }
  }

  return { headYawDeg, limited };
};

/** Everything the head's yaw is solved from, every array indexed by sample. */
export interface HeadInput {
  tempo: Tempo;
  /** The solved torso yaw the head is measured against, degrees. */
  torsoYawDeg: readonly number[];
  /** Bearing from the head to what it is looking at, degrees; absent = nothing to look at. */
  bearingDeg: readonly (number | undefined)[];
}

/** The head's yaw relative to the torso, and every sample the limiter had to act on. */
export interface HeadSolution {
  headYawDeg: readonly number[];
  limited: readonly LimitedSample[];
}

/** How far above the hips the head sits along the torso, px. */
export const NECK_RISE_PX = HEIGHTS.headPx - HEIGHTS.hipPx;

/**
 * Where the head is: up the torso from the hips, tilted forward by the lean.
 * The user's ruling on the eyes — approximate them by the head/neck centre —
 * means this one point is both what the head draws at and what another
 * dancer's look target resolves to.
 */
export const headPoint = (hip: Vec3, leanDeg: number, yawDeg: number): Vec3 => {
  const lean = (leanDeg * Math.PI) / 180;
  const forward = dirOf(yawDeg);
  const reach = NECK_RISE_PX * Math.sin(lean);
  return {
    x: hip.x + forward[0] * reach,
    y: hip.y + forward[1] * reach,
    z: hip.z + NECK_RISE_PX * Math.cos(lean),
  };
};

/** How far away a look given as a bare direction puts its target, px. */
export const LOOK_DISTANCE_PX = 100;

/** Bearing from `head` to `target`, degrees; absent when the two coincide. */
export const lookBearing = (head: Vec3, target: Vec3): number | undefined => {
  const dx = target.x - head.x;
  const dy = target.y - head.y;
  return Math.hypot(dx, dy) < 1e-9 ? undefined : angleOf(dx, dy);
};
