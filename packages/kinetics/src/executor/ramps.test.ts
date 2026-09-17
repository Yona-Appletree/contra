import { smooth } from "@caller/core";
import { describe, expect, it } from "vitest";
import { HEIGHTS, type PointName } from "../body/Body.js";
import type { Trajectory } from "../motion/Trajectory.js";
import { proveMotion } from "../motion/prove.js";
import type { Vec3 } from "../motion/Vec3.js";
import { ANGULAR_CAPS, capsAtTempo } from "../units/caps.js";
import { degPerBeat, tempo } from "../units/Tempo.js";
import { bump, cosineRamp, LEAN_BEATS, rampAt } from "./ramps.js";

const T = tempo(112);

const ramped = (point: PointName, fn: (beat: number) => Vec3, beats: number): Trajectory => {
  const length = Math.round(beats * T.samplesPerBeat) + 1;
  const samples: Vec3[] = [];
  for (let i = 0; i < length; i++) samples.push(fn(i / T.samplesPerBeat));
  return { tempo: T, beat0: 0, length, points: { [point]: samples }, channels: {} };
};

describe("cosineRamp", () => {
  it("runs 0 to 1 and clamps outside", () => {
    expect(cosineRamp(0)).toBe(0);
    expect(cosineRamp(1)).toBeCloseTo(1, 12);
    expect(cosineRamp(0.5)).toBeCloseTo(0.5, 12);
    expect(cosineRamp(-3)).toBe(0);
    expect(cosineRamp(7)).toBeCloseTo(1, 12);
  });

  it("leaves and arrives at a standstill", () => {
    const h = 1e-6;
    expect(Math.abs(cosineRamp(h) - cosineRamp(0)) / h).toBeLessThan(1e-3);
    expect(Math.abs(cosineRamp(1) - cosineRamp(1 - h)) / h).toBeLessThan(1e-3);
  });

  it("takes a hand 12 px in one beat where a smoothstep does not — P2's finding", () => {
    // The take, sampled the way the executor samples it, is clean.
    const take = ramped(
      "handL",
      (beat) => ({ x: cosineRamp(beat - 1) * 12, y: 0, z: HEIGHTS.shoulderPx }),
      3,
    );
    expect(proveMotion(take)).toEqual([]);

    // And the reason it is a cosine and not a smoothstep is the peak of the
    // curve itself: `6d` against `d π² / 2`, which at 12 px in one beat is 72
    // against 59.2 and a hand cap of 64.6. The peak is measured off the ramp
    // rather than off the proof because the proof's 16 samples a beat are a
    // low-pass: two central differences over a spike a sixteenth of a beat
    // wide average most of it away, and both curves read 54 there.
    const cap = capsAtTempo(T).handL.accelPxPerBeat2;
    expect(peakAccel(cosineRamp, 12)).toBeLessThan(cap);
    expect(peakAccel(smooth, 12)).toBeGreaterThan(cap);
  });
});

/** The largest |f″| of a ramp of `px` over one beat, measured off the curve. */
const peakAccel = (ease: (s: number) => number, px: number): number => {
  const h = 1e-4;
  let peak = 0;
  for (let s = 0; s <= 1; s += h) {
    const second = (ease(s + h) - 2 * ease(s) + ease(s - h)) / (h * h);
    peak = Math.max(peak, Math.abs(second) * px);
  }
  return peak;
};

describe("rampAt", () => {
  it("is nothing before its start and everything a ramp later", () => {
    expect(rampAt(3.9, 4, 2)).toBe(0);
    expect(rampAt(4, 4, 2)).toBe(0);
    expect(rampAt(5, 4, 2)).toBeCloseTo(0.5, 12);
    expect(rampAt(6, 4, 2)).toBeCloseTo(1, 12);
    expect(rampAt(99, 4, 2)).toBeCloseTo(1, 12);
  });

  it("is a step when it has no beats to run over", () => {
    expect(rampAt(3.9, 4, 0)).toBe(0);
    expect(rampAt(4, 4, 0)).toBe(1);
  });
});

describe("bump", () => {
  it("lifts in the middle and nowhere else", () => {
    expect(bump(0)).toBeCloseTo(0, 12);
    expect(bump(0.5)).toBeCloseTo(1, 12);
    expect(bump(1)).toBeCloseTo(0, 12);
  });
});

describe("LEAN_BEATS", () => {
  it("folds a 25° bow slower than a back folds, where one beat would not", () => {
    const peak = (deg: number, beats: number): number => (deg * Math.PI) / (2 * beats);
    const cap = degPerBeat(T, ANGULAR_CAPS.leanDegPerS);
    expect(peak(25, 1)).toBeGreaterThan(cap);
    expect(peak(25, LEAN_BEATS)).toBeLessThan(cap);
  });
});
