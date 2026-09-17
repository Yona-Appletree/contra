import type { Vec2 } from "@caller/core";
import { angleDiff, dist, lerp } from "@caller/core";
import type { Tempo } from "../units/Tempo.js";
import { cmToPx } from "../units/Tempo.js";
import {
  MAX_PIVOT_STANDING_DEG,
  MAX_PIVOT_STEPPING_DEG,
  MAX_STEP_CM,
  PREFERRED_STEP_CM,
} from "../units/limits.js";
import type { Pose } from "./state.js";

/** The assembly limits, in px at a tempo. */
export interface PxLimits {
  maxStepPx: number;
  preferredStepPx: number;
  maxPivotSteppingDeg: number;
  maxPivotStandingDeg: number;
  /** Closer than this is "there". */
  tolerancePx: number;
  toleranceDeg: number;
}

export const limitsAtTempo = (t: Tempo): PxLimits => ({
  maxStepPx: cmToPx(t, MAX_STEP_CM),
  preferredStepPx: cmToPx(t, PREFERRED_STEP_CM),
  maxPivotSteppingDeg: MAX_PIVOT_STEPPING_DEG,
  maxPivotStandingDeg: MAX_PIVOT_STANDING_DEG,
  tolerancePx: 1,
  toleranceDeg: 5,
});

/** One planned beat of walking: where the hip lands and how much the facing turns. */
export interface PlannedStep {
  to: Vec2;
  facing: number;
  pivot: number;
  lengthPx: number;
}

/**
 * How many beats it takes to get from one pose to another within the limits:
 * zero when already there, else enough steps that no step is longer than
 * `maxStepPx` and no step carries more than `maxPivotSteppingDeg` of turn —
 * or, standing still, more than `maxPivotStandingDeg`.
 */
export const beatsNeeded = (from: Pose, to: Pose, limits: PxLimits): number => {
  const d = dist(from.p, to.p);
  const turn = Math.abs(angleDiff(from.facing, to.facing));
  const there = d <= limits.tolerancePx;
  const facing = turn <= limits.toleranceDeg;
  if (there && facing) return 0;
  if (there) return Math.ceil(turn / limits.maxPivotStandingDeg);
  return Math.max(Math.ceil(d / limits.maxStepPx), Math.ceil(turn / limits.maxPivotSteppingDeg), 1);
};

/**
 * Plan `beats` equal steps from one pose to another. With more beats than
 * needed the steps are shorter, never faster; with fewer the caller has a
 * timing problem and gets `undefined`.
 */
export const planSteps = (
  from: Pose,
  to: Pose,
  beats: number,
  limits: PxLimits,
): PlannedStep[] | undefined => {
  if (beats < beatsNeeded(from, to, limits)) return undefined;
  const steps: PlannedStep[] = [];
  const total = angleDiff(from.facing, to.facing);
  let facing = from.facing;
  for (let i = 1; i <= beats; i++) {
    const k = i / beats;
    const p = lerp(from.p, to.p, k);
    const nextFacing = from.facing + total * k;
    const prev = i === 1 ? from.p : lerp(from.p, to.p, (i - 1) / beats);
    steps.push({ to: p, facing: nextFacing, pivot: nextFacing - facing, lengthPx: dist(prev, p) });
    facing = nextFacing;
  }
  return steps;
};
