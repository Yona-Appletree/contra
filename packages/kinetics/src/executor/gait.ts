import type { Vec2 } from "@caller/core";
import { bodyPoint } from "@caller/core";
import type { Foot } from "../asm/Instruction.js";
import type { Vec3 } from "../motion/Vec3.js";
import type { Tempo } from "../units/Tempo.js";
import type { BeatPose } from "./hipPath.js";
import { bump, cosineRamp } from "./ramps.js";

/**
 * The feet, as a fixed cadence of plants (DA10).
 *
 * One plant per step, alternating, each foot landing **on the beat** at the
 * hip's target for that beat plus its rest offset in the facing frame. Between
 * plants a planted foot does not move at all: that is the executor's truth,
 * and how the pixel painter draws it against the contract's ±2.6 px band is a
 * G1 question, not this file's.
 *
 * A foot's flight is a cosine ramp in the floor plane with a small lift, and
 * runs over the **whole beat before the plant**, not the half beat DA10 first
 * guessed at. The arithmetic is why: two of the fixture's 35 cm steps put
 * 15.6 px between one plant of a foot and its next, and *no* smooth profile
 * covers 15.6 px in half a beat inside the foot's 1200 cm/s² cap — the floor
 * for any profile with still ends is `4d/T²`, which is 500 px/beat² at
 * `T = ½` against a cap of 86.1. Over a whole beat the cosine ramp peaks at
 * 77 and passes, and the cadence that falls out of it is the one a walk
 * actually has: each foot flies for exactly as long as the other is down.
 *
 * For the same reason a turn in place does not re-plant *both* feet inside
 * its beat, which DA10 also guessed at: at 4.5 px of swing per quarter turn
 * that would be 89 px/beat² for the rotation alone, before the trailing foot
 * has caught up with the step before it. A beat with no step **settles** one
 * foot instead — the one that has been down longest — over the whole beat,
 * and the other settles on the next beat it is not needed. A dancer turning
 * on the spot therefore turns on one foot at a time, which is what a dancer
 * turning on the spot does.
 */
export const gait = (plan: GaitPlan, tempo: Tempo): Gait => {
  const plants = plantsOf(plan);
  return {
    footL: samplesOf(
      plants.filter((p) => p.foot === "L"),
      plan.length,
      tempo,
    ),
    footR: samplesOf(
      plants.filter((p) => p.foot === "R"),
      plan.length,
      tempo,
    ),
  };
};

/** What the cadence is built from: where the hips go, and which foot carries each beat. */
export interface GaitPlan {
  /** The hip target and facing at beats `0 … n`, as `hipPath` reads them. */
  targets: readonly BeatPose[];
  /** The foot that steps over beat `b`, or nothing if the dancer stands. */
  stepFoot: readonly (Foot | undefined)[];
  /** Samples to produce. */
  length: number;
}

/** Both feet, sampled. */
export interface Gait {
  footL: readonly Vec3[];
  footR: readonly Vec3[];
}

/** One foot arriving somewhere, and how long it was in the air getting there. */
export interface Plant {
  beat: number;
  foot: Foot;
  p: Vec2;
  flightBeats: number;
}

/**
 * Where a foot rests relative to the hips: forward 2.5 px and 2.0 px out to
 * its own side, in the facing frame.
 *
 * Copied, not imported, from engine 2's
 * `packages/core/src/kinematics/quietMotion.ts` (`FOOT_REST_FORWARD_PX`,
 * `FOOT_REST_LATERAL_PX`). Engine 3 may not import engine 2's kinematics, and
 * the stance is a number the two engines happen to agree on rather than a
 * dependency between them.
 */
export const FOOT_REST_FORWARD_PX = 2.5;
export const FOOT_REST_LATERAL_PX = 2.0;

/** How high a foot lifts at the middle of its flight, px. */
export const FOOT_LIFT_PX = 1;

/** Every flight, step or settle, is the whole beat before the plant. */
export const FLIGHT_BEATS = 1;

/** Where `foot` rests for a dancer standing at `pose`. */
export const footRestAt = (pose: BeatPose, foot: Foot): Vec2 =>
  bodyPoint(
    pose.p,
    pose.facing,
    FOOT_REST_FORWARD_PX,
    foot === "R" ? FOOT_REST_LATERAL_PX : -FOOT_REST_LATERAL_PX,
  );

/**
 * Every plant in the plan, in time order, starting with both feet at rest at
 * beat 0.
 *
 * A stepping beat lands its own foot on the next beat, at the rest offset of
 * the pose the hip is arriving at. A beat with no step settles the foot that
 * has been on the floor longest onto the same beat's pose — which is a turn
 * catching a foot up with the new facing, a stop bringing the trailing foot
 * home, and, when the dancer has simply been standing, a plant in the place
 * the foot already was and so nothing at all.
 */
export const plantsOf = (plan: GaitPlan): Plant[] => {
  const first = plan.targets[0];
  if (!first) return [];
  const plants: Plant[] = [
    { beat: 0, foot: "L", p: footRestAt(first, "L"), flightBeats: 0 },
    { beat: 0, foot: "R", p: footRestAt(first, "R"), flightBeats: 0 },
  ];
  const last: Record<Foot, number> = { L: 0, R: 0 };
  for (let b = 0; b + 1 < plan.targets.length; b++) {
    const target = plan.targets[b + 1]!;
    const foot: Foot = plan.stepFoot[b] ?? (last.L <= last.R ? "L" : "R");
    plants.push({ beat: b + 1, foot, p: footRestAt(target, foot), flightBeats: FLIGHT_BEATS });
    last[foot] = b + 1;
  }
  return plants.sort((a, b) => a.beat - b.beat);
};

/** One foot's plants, sampled: still on the floor, then a cosine flight with a lift. */
const samplesOf = (plants: readonly Plant[], length: number, tempo: Tempo): Vec3[] => {
  const out: Vec3[] = new Array(length);
  let k = 0;
  for (let i = 0; i < length; i++) {
    const beat = i / tempo.samplesPerBeat;
    while (k + 1 < plants.length && plants[k + 1]!.beat <= beat) k++;
    const from = plants[k]!;
    const next = plants[k + 1];
    if (!next) {
      out[i] = { x: from.p[0], y: from.p[1], z: 0 };
      continue;
    }
    // A flight may not start before the foot landed: a plant crowded onto the
    // one before it flies over whatever gap there is.
    const start = Math.max(next.beat - next.flightBeats, from.beat);
    if (beat <= start || next.beat <= start) {
      out[i] = { x: from.p[0], y: from.p[1], z: 0 };
      continue;
    }
    const s = (beat - start) / (next.beat - start);
    const r = cosineRamp(s);
    out[i] = {
      x: from.p[0] + (next.p[0] - from.p[0]) * r,
      y: from.p[1] + (next.p[1] - from.p[1]) * r,
      z: FOOT_LIFT_PX * bump(s),
    };
  }
  return out;
};
