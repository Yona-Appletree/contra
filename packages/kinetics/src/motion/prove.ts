import type { PointName } from "../body/Body.js";
import { type CapAtTempo, capsAtTempo } from "../units/caps.js";
import { beatOf, type Trajectory } from "./Trajectory.js";
import { dist, len, scale, sub, type Vec3 } from "./Vec3.js";

/** Why a sample fails the proof. */
export type ViolationKind = "speed" | "accel" | "jump" | "vjump" | "nan";

/** One sample of one point that fails its cap. */
export interface Violation {
  point: PointName;
  sample: number;
  beat: number;
  kind: ViolationKind;
  value: number;
  cap: number;
}

/** A point's speed and acceleration at every sample, px/beat and px/beat². */
export interface Kinematics {
  speed: readonly number[];
  accel: readonly number[];
}

/**
 * Central difference of `points` at spacing `dt`: one-sided at the first and
 * last sample, central (`(p[i+1] − p[i−1]) / 2dt`) everywhere between.
 */
const centralDiff = (points: readonly Vec3[], dt: number): Vec3[] => {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0, z: 0 }];
  const out: Vec3[] = new Array(n);
  out[0] = scale(sub(points[1]!, points[0]!), 1 / dt);
  for (let i = 1; i < n - 1; i++) {
    out[i] = scale(sub(points[i + 1]!, points[i - 1]!), 1 / (2 * dt));
  }
  out[n - 1] = scale(sub(points[n - 1]!, points[n - 2]!), 1 / dt);
  return out;
};

/** `point`'s speed and acceleration over `t`, by central difference of its samples. */
export const kinematicsOf = (t: Trajectory, point: PointName): Kinematics => {
  const positions = t.points[point];
  if (!positions || positions.length === 0) return { speed: [], accel: [] };
  const dt = 1 / t.tempo.samplesPerBeat;
  const velocity = centralDiff(positions, dt);
  const acceleration = centralDiff(velocity, dt);
  return {
    speed: velocity.map((v) => len(v)),
    accel: acceleration.map((a) => len(a)),
  };
};

const isNaNVec3 = (v: Vec3): boolean => Number.isNaN(v.x) || Number.isNaN(v.y) || Number.isNaN(v.z);

/**
 * Every point in `t` that violates a cap, at every sample it violates it:
 * over-cap speed or acceleration, a raw jump in position or velocity between
 * adjacent samples too large for the cap to have produced, or a `NaN`.
 * `caps` defaults to `t`'s tempo's caps; a test proving a hand-authored whip
 * against a different table passes its own.
 */
export const proveMotion = (
  t: Trajectory,
  caps: Readonly<Record<PointName, CapAtTempo>> = capsAtTempo(t.tempo),
): Violation[] => {
  const violations: Violation[] = [];
  const dt = 1 / t.tempo.samplesPerBeat;

  for (const point of Object.keys(t.points) as PointName[]) {
    const positions = t.points[point];
    if (!positions || positions.length === 0) continue;
    const cap = caps[point];
    const velocity = centralDiff(positions, dt);
    const kin = kinematicsOf(t, point);

    for (let i = 0; i < positions.length; i++) {
      const beat = beatOf(t, i);
      const speed = kin.speed[i]!;
      const accel = kin.accel[i]!;
      if (isNaNVec3(positions[i]!) || Number.isNaN(speed) || Number.isNaN(accel)) {
        violations.push({ point, sample: i, beat, kind: "nan", value: NaN, cap: NaN });
        continue;
      }
      if (speed > cap.speedPxPerBeat) {
        violations.push({
          point,
          sample: i,
          beat,
          kind: "speed",
          value: speed,
          cap: cap.speedPxPerBeat,
        });
      }
      if (accel > cap.accelPxPerBeat2) {
        violations.push({
          point,
          sample: i,
          beat,
          kind: "accel",
          value: accel,
          cap: cap.accelPxPerBeat2,
        });
      }
    }

    for (let i = 0; i < positions.length - 1; i++) {
      const jumpCap = cap.speedPxPerBeat * dt;
      const jumpValue = dist(positions[i + 1]!, positions[i]!);
      if (jumpValue > jumpCap) {
        violations.push({
          point,
          sample: i + 1,
          beat: beatOf(t, i + 1),
          kind: "jump",
          value: jumpValue,
          cap: jumpCap,
        });
      }

      const vjumpCap = cap.accelPxPerBeat2 * dt;
      const vjumpValue = dist(velocity[i + 1]!, velocity[i]!);
      if (vjumpValue > vjumpCap) {
        violations.push({
          point,
          sample: i + 1,
          beat: beatOf(t, i + 1),
          kind: "vjump",
          value: vjumpValue,
          cap: vjumpCap,
        });
      }
    }
  }

  return violations.sort((a, b) => a.sample - b.sample);
};
