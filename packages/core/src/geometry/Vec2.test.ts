import { describe, expect, it } from "vitest";
import { ZERO, add, addScaled, dist, dot, len, lerp, norm, rot, scale, sub, vec2 } from "./Vec2.js";

describe("Vec2", () => {
  it("does the arithmetic", () => {
    expect(vec2(1, 2)).toEqual([1, 2]);
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
    expect(sub([1, 2], [3, 4])).toEqual([-2, -2]);
    expect(scale([1, -2], 3)).toEqual([3, -6]);
    expect(addScaled([1, 1], [0, -1], 4.5)).toEqual([1, -3.5]);
    expect(dot([1, 2], [3, 4])).toBe(11);
    expect(len([3, 4])).toBe(5);
    expect(dist([1, 1], [4, 5])).toBe(5);
    expect(lerp([0, 0], [10, -4], 0.25)).toEqual([2.5, -1]);
  });

  it("normalises, and returns the origin for a zero vector", () => {
    const n = norm([3, 4]);
    expect(n[0]).toBeCloseTo(0.6, 12);
    expect(n[1]).toBeCloseTo(0.8, 12);
    expect(norm(ZERO)).toEqual([0, 0]);
  });

  it("rotates positive from +x toward +y", () => {
    const r = rot([1, 0], 90);
    expect(r[0]).toBeCloseTo(0, 12);
    expect(r[1]).toBeCloseTo(1, 12);
    const back = rot(r, -90);
    expect(back[0]).toBeCloseTo(1, 12);
    expect(back[1]).toBeCloseTo(0, 12);
  });

  it("rotation preserves length", () => {
    for (let a = -360; a <= 360; a += 17) {
      expect(len(rot([3, -4], a))).toBeCloseTo(5, 12);
    }
  });
});
