import { describe, expect, it } from "vitest";
import { HEIGHTS } from "../body/Body.js";
import { vec3 } from "../motion/Vec3.js";
import { ANGULAR_CAPS } from "../units/caps.js";
import { degPerBeat, tempo } from "../units/Tempo.js";
import { headPoint, lookBearing, NECK_RISE_PX, solveHead } from "./head.js";

const t = tempo(112);
const capPerSample = degPerBeat(t, ANGULAR_CAPS.lookDegPerS) / t.samplesPerBeat;

describe("headPoint", () => {
  it("stands the head up the torso from the hips", () => {
    const head = headPoint(vec3(3, -2, HEIGHTS.hipPx), 0, 90);
    expect(head).toEqual(vec3(3, -2, HEIGHTS.headPx));
    expect(NECK_RISE_PX).toBe(HEIGHTS.headPx - HEIGHTS.hipPx);
  });

  it("tips it forward along the facing when the body leans", () => {
    const head = headPoint(vec3(0, 0, HEIGHTS.hipPx), 15, 0);
    expect(head.x).toBeCloseTo(NECK_RISE_PX * Math.sin((15 * Math.PI) / 180), 9);
    expect(head.y).toBeCloseTo(0, 9);
    expect(head.z).toBeLessThan(HEIGHTS.headPx);
  });
});

describe("solveHead", () => {
  it("looks straight at a target the torso already faces", () => {
    const solved = solveHead({ tempo: t, torsoYawDeg: [90, 90], bearingDeg: [90, 90] });
    expect([...solved.headYawDeg]).toEqual([0, 0]);
  });

  it("clamps a partner behind the shoulder to the neck's range", () => {
    const n = 64;
    const solved = solveHead({
      tempo: t,
      torsoYawDeg: new Array<number>(n).fill(0),
      bearingDeg: new Array<number>(n).fill(150),
    });
    for (const yaw of solved.headYawDeg) expect(yaw).toBeLessThanOrEqual(ANGULAR_CAPS.lookDeg);
    expect(solved.headYawDeg[n - 1]).toBeCloseTo(ANGULAR_CAPS.lookDeg, 9);
  });

  it("squares the head when there is nothing to look at", () => {
    const solved = solveHead({ tempo: t, torsoYawDeg: [45, 45], bearingDeg: [undefined, 45] });
    expect([...solved.headYawDeg]).toEqual([0, 0]);
  });

  it("never turns the head faster than the neck's rate, and says when it had to hold it back", () => {
    const n = 48;
    const torsoYawDeg = new Array<number>(n).fill(0);
    // Looking sharply left, then sharply right, on the sample: a whip no neck does.
    const bearingDeg = Array.from({ length: n }, (_, i) => (i < n / 2 ? -60 : 60));
    const solved = solveHead({ tempo: t, torsoYawDeg, bearingDeg });

    for (let i = 1; i < n; i++) {
      const step = Math.abs(solved.headYawDeg[i]! - solved.headYawDeg[i - 1]!);
      expect(step).toBeLessThanOrEqual(capPerSample + 1e-9);
    }
    expect(solved.limited.length).toBeGreaterThan(0);
    expect(solved.limited[0]!.cap).toBeCloseTo(capPerSample, 12);
    // 300°/s is the cap the ruling names; at this tempo that is this many
    // degrees a sample, and the limiter is measured against it.
    expect(capPerSample * t.samplesPerBeat * (t.bpm / 60)).toBeCloseTo(ANGULAR_CAPS.lookDegPerS, 9);
  });
});

describe("lookBearing", () => {
  it("is the flat bearing from one head to another", () => {
    expect(lookBearing(vec3(0, 0, 41), vec3(0, 5, 41))).toBeCloseTo(90, 9);
  });

  it("is absent when there is no direction to be had", () => {
    expect(lookBearing(vec3(0, 0, 41), vec3(0, 0, 60))).toBeUndefined();
  });
});
