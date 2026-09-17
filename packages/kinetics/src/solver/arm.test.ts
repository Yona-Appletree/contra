import { ARM_REACH_PX, FOREARM_PX, UPPER_ARM_PX } from "@caller/core";
import { describe, expect, it } from "vitest";
import { len, sub, vec3, type Vec3 } from "../motion/Vec3.js";
import { boneLengths, solveArm } from "./arm.js";

/** Facing +x, so the right side is +y: `OUTWARD` is where a positive swivel goes. */
const YAW = 0;
const OUTWARD = vec3(0, 1, 0);

/** The unit direction from `a` to `b`. */
const unit = (a: Vec3, b: Vec3): Vec3 => {
  const d = sub(b, a);
  const m = len(d);
  return vec3(d.x / m, d.y / m, d.z / m);
};

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The point on the shoulder–hand line closest to `p`. */
const onLine = (shoulder: Vec3, hand: Vec3, p: Vec3): Vec3 => {
  const u = unit(shoulder, hand);
  const t = dot(sub(p, shoulder), u);
  return vec3(shoulder.x + u.x * t, shoulder.y + u.y * t, shoulder.z + u.z * t);
};

const SHOULDER = vec3(0, 0, 35);

/** Hands at `d` px from the shoulder, in several directions. */
const handsAt = (d: number): Vec3[] => {
  const dirs: Vec3[] = [
    vec3(1, 0, 0),
    vec3(0, 1, 0),
    vec3(0, 0, -1),
    vec3(0.6, -0.48, -0.64),
    vec3(-0.5774, 0.5774, -0.5774),
    vec3(0, 0.6, 0.8),
  ];
  return dirs.map((v) => {
    const m = len(v);
    return vec3(SHOULDER.x + (v.x / m) * d, SHOULDER.y + (v.y / m) * d, SHOULDER.z + (v.z / m) * d);
  });
};

describe("solveArm", () => {
  it("keeps both bones at the contract's 7.5 px, whatever the hand is doing", () => {
    for (const d of [2, 8, 14]) {
      for (const hand of handsAt(d)) {
        for (const swivel of [0, 10, -35, 90]) {
          const { elbow, reach } = solveArm(SHOULDER, hand, swivel, "right", YAW);
          expect(reach).toBeUndefined();
          const [upper, fore] = boneLengths(SHOULDER, elbow, hand);
          expect(upper).toBeCloseTo(UPPER_ARM_PX, 9);
          expect(fore).toBeCloseTo(FOREARM_PX, 9);
        }
      }
    }
  });

  it("hangs the elbow below the shoulder–hand line with no swivel", () => {
    for (const d of [2, 8, 14]) {
      for (const hand of handsAt(d)) {
        const { elbow } = solveArm(SHOULDER, hand, 0, "right", YAW);
        const foot = onLine(SHOULDER, hand, elbow);
        // An arm pointing straight up or down has no "below"; every other one does.
        if (Math.abs(unit(SHOULDER, hand).z) > 0.999) continue;
        expect(elbow.z).toBeLessThan(foot.z);
      }
    }
  });

  it("swivels the elbow outward by exactly the angle asked for", () => {
    const hand = vec3(6, 3, 27);
    const flat = solveArm(SHOULDER, hand, 0, "right", YAW).elbow;
    const swivelled = solveArm(SHOULDER, hand, 10, "right", YAW).elbow;
    const centre = onLine(SHOULDER, hand, flat);

    const a = unit(centre, flat);
    const b = unit(centre, swivelled);
    const between = (Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * 180) / Math.PI;
    expect(between).toBeCloseTo(10, 9);

    // And it went out, not in: further along the body's own side than it was.
    expect(dot(sub(swivelled, centre), OUTWARD)).toBeGreaterThan(dot(sub(flat, centre), OUTWARD));
  });

  it("reports a hand it cannot reach and leaves the arm straight, not hidden", () => {
    const hand = vec3(0, 15.5, 35);
    const { elbow, reach } = solveArm(SHOULDER, hand, 10, "right", YAW);
    expect(reach).toEqual({ distancePx: 15.5, reachPx: ARM_REACH_PX });
    // On the line: the over-stretch is there to see.
    expect(len(sub(elbow, onLine(SHOULDER, hand, elbow)))).toBeCloseTo(0, 9);
    expect(len(sub(elbow, SHOULDER))).toBeCloseTo(UPPER_ARM_PX, 9);
  });

  it("hangs straight down when the hand is on top of the shoulder", () => {
    const { elbow } = solveArm(SHOULDER, vec3(0, 0.1, 35), 10, "right", YAW);
    expect(elbow).toEqual(vec3(0, 0, 35 - UPPER_ARM_PX));
  });
});
