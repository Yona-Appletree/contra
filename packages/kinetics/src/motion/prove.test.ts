import { smooth } from "@caller/core";
import { describe, expect, it } from "vitest";
import { HEIGHTS, type PointName } from "../body/Body.js";
import { tempo } from "../units/Tempo.js";
import { proveMotion } from "./prove.js";
import type { Trajectory } from "./Trajectory.js";
import type { Vec3 } from "./Vec3.js";

/**
 * A trajectory carrying one point's samples, `fn` evaluated at each sample's
 * beat over `beats` beats at `bpm` (default 112).
 */
const trajectoryFrom = (
  point: PointName,
  fn: (beat: number) => Vec3,
  beats: number,
  bpm = 112,
): Trajectory => {
  const t = tempo(bpm);
  const length = Math.round(beats * t.samplesPerBeat) + 1;
  const samples: Vec3[] = [];
  for (let i = 0; i < length; i++) samples.push(fn(i / t.samplesPerBeat));
  return { tempo: t, beat0: 0, length, points: { [point]: samples }, channels: {} };
};

describe("proveMotion", () => {
  it("passes a hip walking a straight line under its speed cap", () => {
    const t = trajectoryFrom("hip", (beat) => ({ x: 15 * beat, y: 0, z: HEIGHTS.hipPx }), 4);
    expect(proveMotion(t)).toEqual([]);
  });

  it("rejects a hip walking a straight line over its speed cap, on every sample", () => {
    const t = trajectoryFrom("hip", (beat) => ({ x: 20 * beat, y: 0, z: HEIGHTS.hipPx }), 4);
    const violations = proveMotion(t);
    const speedSamples = new Set(violations.filter((v) => v.kind === "speed").map((v) => v.sample));
    expect(speedSamples.size).toBe(t.length);
  });

  it("catches a hand at rest that jumps 20 px between two samples", () => {
    const t = trajectoryFrom(
      "handL",
      (beat) => ({ x: beat < 1 ? 0 : 20, y: 0, z: HEIGHTS.shoulderPx }),
      2,
    );
    const violations = proveMotion(t);
    const jumps = violations.filter((v) => v.kind === "jump");
    expect(jumps.length).toBe(1);
    expect(jumps[0]!.sample).toBe(16);
    // The jump also shows up as an over-cap speed and acceleration around it.
    expect(violations.some((v) => v.kind === "speed")).toBe(true);
    expect(violations.some((v) => v.kind === "accel")).toBe(true);
  });

  it("passes a 12 px hand take ramped with smoothstep over 1.25 beats", () => {
    // A one-beat smoothstep take of 12 px peaks at 6 × 12 = 72 px/beat², over
    // the hand's ~64.6 px/beat² cap at 112 bpm — the ramp finding below. A
    // 1.25-beat ramp peaks at 6 × 12 / 1.25² ≈ 46.1, comfortably under.
    const t = trajectoryFrom(
      "handL",
      (beat) => ({ x: smooth(beat / 1.25) * 12, y: 0, z: HEIGHTS.shoulderPx }),
      1.25,
    );
    expect(proveMotion(t)).toEqual([]);
  });

  it("rejects an elbow doing 334 px/beat (engine 2's whip)", () => {
    const t = trajectoryFrom(
      "elbowL",
      (beat) => ({ x: 334 * beat, y: 0, z: HEIGHTS.shoulderPx }),
      2,
    );
    const violations = proveMotion(t);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.kind === "speed")).toBe(true);
  });

  it("flags a NaN sample", () => {
    const t = trajectoryFrom(
      "hip",
      (beat) =>
        beat === 1 ? { x: NaN, y: 0, z: HEIGHTS.hipPx } : { x: 0, y: 0, z: HEIGHTS.hipPx },
      2,
    );
    const violations = proveMotion(t);
    expect(violations.some((v) => v.kind === "nan")).toBe(true);
  });
});
