import { describe, expect, it } from "vitest";
import {
  angleDiff,
  angleLerp,
  angleOf,
  angleOfVec,
  bodyPoint,
  dirOf,
  leftOf,
  rightOf,
} from "./Angle.js";

describe("angleOf / dirOf", () => {
  it("round-trips", () => {
    for (const a of [0, 37, 90, 179, -90, -179]) {
      const d = dirOf(a);
      expect(angleOfVec(d)).toBeCloseTo(a, 12);
    }
    expect(angleOf(0, 1)).toBeCloseTo(90, 12);
    expect(angleOf(-1, 0)).toBeCloseTo(180, 12);
  });
});

describe("leftOf / rightOf", () => {
  it("are perpendicular unit vectors, left and right of the facing", () => {
    // Overhead view with y down: facing +x, the dancer's left is -y.
    const l = leftOf(0);
    const r = rightOf(0);
    expect(l[0]).toBeCloseTo(0, 12);
    expect(l[1]).toBeCloseTo(-1, 12);
    expect(r[0]).toBeCloseTo(0, 12);
    expect(r[1]).toBeCloseTo(1, 12);
  });

  it("are exact opposites at every facing", () => {
    for (let a = -180; a <= 180; a += 13) {
      const l = leftOf(a);
      const r = rightOf(a);
      expect(l[0]).toBeCloseTo(-r[0], 12);
      expect(l[1]).toBeCloseTo(-r[1], 12);
      const d = dirOf(a);
      expect(d[0] * l[0] + d[1] * l[1]).toBeCloseTo(0, 12);
    }
  });
});

describe("angleDiff / angleLerp", () => {
  it("takes the shortest arc", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
    expect(angleDiff(0, 180)).toBe(180);
    expect(angleDiff(0, -180)).toBe(180);
    expect(angleDiff(0, 190)).toBe(-170);
    expect(angleDiff(-720 + 5, 720 + 15)).toBe(10);
  });

  it("interpolates across the wrap, not the long way round", () => {
    expect(angleLerp(350, 10, 0)).toBe(350);
    expect(angleLerp(350, 10, 0.5)).toBe(360);
    expect(angleLerp(350, 10, 1)).toBe(370);
    // Same heading as the target, which is what matters.
    expect(angleDiff(angleLerp(350, 10, 1), 10)).toBe(0);
  });
});

describe("bodyPoint", () => {
  it("offsets forward and to the dancer's right", () => {
    expect(bodyPoint([0, 0], 0, 1, 0)[0]).toBeCloseTo(1, 12);
    const right = bodyPoint([0, 0], 0, 0, 2);
    expect(right[0]).toBeCloseTo(0, 12);
    expect(right[1]).toBeCloseTo(2, 12);
    // Facing 180, "right" flips to -y.
    const flipped = bodyPoint([0, 0], 180, 0, 2);
    expect(flipped[1]).toBeCloseTo(-2, 12);
  });

  it("matches the spike's shoulder placement at facing 0", () => {
    // bodyPt([-7,0], 0, 0.3, -5.2) and bodyPt([-7,0], 0, 0.3, 5.2)
    const l = bodyPoint([-7, 0], 0, 0.3, -5.2);
    const r = bodyPoint([-7, 0], 0, 0.3, 5.2);
    expect(l[0]).toBeCloseTo(-6.7, 12);
    expect(l[1]).toBeCloseTo(-5.2, 12);
    expect(r[0]).toBeCloseTo(-6.7, 12);
    expect(r[1]).toBeCloseTo(5.2, 12);
  });
});
