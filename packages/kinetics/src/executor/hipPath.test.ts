import { describe, expect, it } from "vitest";
import { HEIGHTS } from "../body/Body.js";
import type { Trajectory } from "../motion/Trajectory.js";
import { kinematicsOf, proveMotion } from "../motion/prove.js";
import { ANGULAR_CAPS, capsAtTempo } from "../units/caps.js";
import { degPerBeat, tempo } from "../units/Tempo.js";
import { hipPath, unwrap, type BeatPose } from "./hipPath.js";

const T = tempo(112);

/** A trajectory carrying only the hip, for the proof. */
const asTrajectory = (path: ReturnType<typeof hipPath>): Trajectory => ({
  tempo: T,
  beat0: 0,
  length: path.length,
  points: { hip: path.hip },
  channels: { facing: path.facing },
});

/** Stand for a beat, walk `steps` steps of `px` along +x, then stop. */
const walk = (steps: number, px: number): BeatPose[] => {
  const out: BeatPose[] = [{ p: [0, 0], facing: 0 }];
  for (let i = 1; i <= steps; i++) out.push({ p: [i * px, 0], facing: 0 });
  out.push({ p: [steps * px, 0], facing: 0 });
  return out;
};

describe("hipPath", () => {
  it("is exactly on its target at every beat", () => {
    const targets = walk(4, 4);
    const path = hipPath(targets, T);
    targets.forEach((target, beat) => {
      const i = beat * T.samplesPerBeat;
      expect(path.hip[i]!.x).toBeCloseTo(target.p[0], 9);
      expect(path.hip[i]!.y).toBeCloseTo(target.p[1], 9);
      expect(path.facing[i]!).toBeCloseTo(target.facing, 9);
    });
  });

  it("keeps the hip flat: no vertical bounce, ever", () => {
    const path = hipPath(walk(4, 4), T);
    for (const p of path.hip) expect(p.z).toBe(HEIGHTS.hipPx);
  });

  it("proves a walk of four 16 cm steps and a stop", () => {
    expect(proveMotion(asTrajectory(hipPath(walk(4, 4), T)))).toEqual([]);
  });

  /**
   * The phase file's example was four **15 px** steps, which no interpolation
   * can make legal: a hip leaving a standstill and covering 15 px inside one
   * beat needs about `4 × 15 = 60` px/beat² off the mark against a cap of
   * 17.94, and even the gentlest profile with still ends needs `4d/T² = 60`.
   * 15 px a beat is a 60 cm step — the cap says a dancer reaches that in two
   * beats, not one. The scheduler has no cruise ramp on the first step of a
   * walk, which is the finding, not the number.
   */
  it("reports a walk of four 60 cm steps rather than smoothing it away", () => {
    const violations = proveMotion(asTrajectory(hipPath(walk(4, 15), T)));
    expect(violations.some((v) => v.point === "hip" && v.kind === "accel")).toBe(true);
    const worst = Math.max(...violations.filter((v) => v.kind === "accel").map((v) => v.value));
    // Under the natural spline the peak is lower than Catmull-Rom's 3.3×
    // (it spreads the start-up over the neighbouring beats) but still over.
    expect(worst).toBeGreaterThan(capsAtTempo(T).hip.accelPxPerBeat2);
  });

  it("stands still where the dancer stands still on both sides", () => {
    const targets: BeatPose[] = [
      { p: [0, 0], facing: 0 },
      { p: [0, 0], facing: 0 },
      { p: [0, 0], facing: 0 },
      { p: [0, 0], facing: 0 },
      { p: [4, 0], facing: 0 },
    ];
    const path = hipPath(targets, T);
    for (let i = 0; i <= 2 * T.samplesPerBeat; i++) {
      expect(path.hip[i]!.x).toBeCloseTo(0, 9);
    }
  });

  it("turns a dancer 90° in place inside the yaw caps", () => {
    const targets: BeatPose[] = [
      { p: [0, 0], facing: 0 },
      { p: [0, 0], facing: 0 },
      { p: [0, 0], facing: 90 },
      { p: [0, 0], facing: 90 },
    ];
    const path = hipPath(targets, T);
    let rate = 0;
    let accel = 0;
    const dt = 1 / T.samplesPerBeat;
    for (let i = 1; i < path.length - 1; i++) {
      const v = (path.facing[i + 1]! - path.facing[i - 1]!) / (2 * dt);
      rate = Math.max(rate, Math.abs(v));
    }
    for (let i = 2; i < path.length - 2; i++) {
      const a = (path.facing[i + 1]! - 2 * path.facing[i]! + path.facing[i - 1]!) / (dt * dt);
      accel = Math.max(accel, Math.abs(a));
    }
    expect(rate).toBeLessThan(degPerBeat(T, ANGULAR_CAPS.yawDegPerS));
    expect(accel).toBeLessThan(degPerBeat(T, ANGULAR_CAPS.yawAccelDegPerS2) * (60 / T.bpm));
    // And it does turn: 90° arrived at, not drifted toward.
    expect(path.facing[path.length - 1]!).toBeCloseTo(90, 9);
  });

  it("carries a dancer the long way round rather than back through zero", () => {
    // Eight 45° pivots: the facing rises to 360, never wraps, and the hip's
    // interpolation therefore never runs backwards through the set.
    const targets: BeatPose[] = [];
    for (let i = 0; i <= 8; i++) targets.push({ p: [0, 0], facing: i * 45 });
    const path = hipPath(targets, T);
    expect(path.facing[path.length - 1]!).toBeCloseTo(360, 9);
    for (let i = 1; i < path.length; i++) {
      expect(path.facing[i]!).toBeGreaterThanOrEqual(path.facing[i - 1]! - 1e-9);
    }
  });

  it("proves a hip walking a circle at the do-si-do's radius", () => {
    // Eight 45° places round a 10 px circle, entered and left at speed: the
    // body of a do-si-do with no standing start to pay for.
    const targets: BeatPose[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i * 45 * Math.PI) / 180;
      targets.push({ p: [10 * Math.cos(a), 10 * Math.sin(a)], facing: 0 });
    }
    const path = hipPath(targets, T);
    const kin = kinematicsOf(asTrajectory(path), "hip");
    // The ends are a standstill the circle does not have; the body of it is
    // what this measures.
    const inner = kin.accel.slice(T.samplesPerBeat, -T.samplesPerBeat);
    expect(Math.max(...inner)).toBeLessThan(capsAtTempo(T).hip.accelPxPerBeat2);
  });
});

describe("unwrap", () => {
  it("makes a wrapped turn continuous", () => {
    expect(unwrap([170, -170, 170])).toEqual([170, 190, 170]);
    expect(unwrap([0, 90, 180, -90, 0])).toEqual([0, 90, 180, 270, 360]);
  });
});
