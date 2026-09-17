import { describe, expect, it } from "vitest";
import { HEIGHTS } from "../body/Body.js";
import { vec3, type Vec3 } from "../motion/Vec3.js";
import { ANGULAR_CAPS } from "../units/caps.js";
import { degPerBeat, tempo } from "../units/Tempo.js";
import { COMFORT_YAW_DEG, comfortYawDeg, solveTorso, type HandPull } from "./torso.js";

const HIP: Vec3 = vec3(0, 0, HEIGHTS.hipPx);

/** A hand `r` px away on the bearing `deg`, at the allemande's height. */
const pullAt = (deg: number, weight: number, r = 7): HandPull => {
  const t = (deg * Math.PI) / 180;
  return { target: vec3(Math.cos(t) * r, Math.sin(t) * r, HEIGHTS.hipPx + 3), weight };
};

describe("comfortYawDeg", () => {
  it("is zero when nothing is held", () => {
    expect(comfortYawDeg(0, HIP, [])).toBe(0);
    expect(comfortYawDeg(37, HIP, [pullAt(90, 0)])).toBe(0);
  });

  it("never turns the shoulders further than the comfort limit", () => {
    for (const bearing of [0, 45, 90, 135, 179, -90, -170]) {
      const yaw = comfortYawDeg(0, HIP, [pullAt(bearing, 1)]);
      expect(Math.abs(yaw)).toBeLessThanOrEqual(COMFORT_YAW_DEG + 1e-9);
    }
    expect(comfortYawDeg(0, HIP, [pullAt(90, 1)])).toBeCloseTo(COMFORT_YAW_DEG, 9);
  });

  it("follows the take's weight continuously, from nothing to the whole turn", () => {
    const seen = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((w) =>
      comfortYawDeg(0, HIP, [pullAt(20, w)]),
    );
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBeCloseTo(20, 9);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
    // No step anywhere: a tenth more weight is a tenth more yaw.
    expect(comfortYawDeg(0, HIP, [pullAt(20, 0.5)])).toBeCloseTo(10, 9);
  });

  it("averages two hands pulling in different directions rather than adding them", () => {
    const yaw = comfortYawDeg(0, HIP, [pullAt(40, 1), pullAt(-40, 1)]);
    expect(yaw).toBeCloseTo(0, 9);
  });
});

describe("solveTorso", () => {
  const t = tempo(112);

  it("is the planned facing when no hand is held", () => {
    const facing = [0, 10, 20, 30];
    const solved = solveTorso({
      tempo: t,
      facing,
      hips: facing.map(() => HIP),
      pulls: facing.map(() => []),
    });
    expect([...solved.yawDeg]).toEqual(facing);
    expect(solved.limited).toEqual([]);
  });

  it("comes round to the hold as the take ramps in", () => {
    const weights = [0, 0.25, 0.5, 0.75, 1];
    const solved = solveTorso({
      tempo: t,
      facing: weights.map(() => 0),
      hips: weights.map(() => HIP),
      pulls: weights.map((w) => [pullAt(20, w)]),
    });
    expect(solved.yawDeg[0]).toBe(0);
    expect(solved.yawDeg[4]).toBeCloseTo(20, 9);
    expect(solved.limited).toEqual([]);
  });

  it("limits a turn the torso cannot make, and says so", () => {
    const facing = [0, 90, 90, 90];
    const solved = solveTorso({
      tempo: t,
      facing,
      hips: facing.map(() => HIP),
      pulls: facing.map(() => []),
    });
    const capPerSample = degPerBeat(t, ANGULAR_CAPS.yawDegPerS) / t.samplesPerBeat;
    expect(solved.limited.length).toBeGreaterThan(0);
    expect(solved.limited[0]).toMatchObject({ sample: 1, cap: capPerSample, value: 90 });
    for (let i = 1; i < solved.yawDeg.length; i++) {
      expect(Math.abs(solved.yawDeg[i]! - solved.yawDeg[i - 1]!)).toBeLessThanOrEqual(
        capPerSample + 1e-9,
      );
    }
  });
});
