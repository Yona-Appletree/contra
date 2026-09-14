import { HOLD_SPACING_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { frame, frameAngle, framePoint, frameVector, reverseFrame } from "./Frame.js";

describe("the group frame", () => {
  it("is the identity when the axis points down the screen", () => {
    const f = frame([0, 0], 90);
    expect(framePoint(f, [3, 4])[0]).toBeCloseTo(3, 9);
    expect(framePoint(f, [3, 4])[1]).toBeCloseTo(4, 9);
    expect(frameAngle(f, 37)).toBe(37);
  });

  it("carries the hold spacing by default", () => {
    expect(frame([0, 0], 90).spacing).toBe(HOLD_SPACING_PX);
  });

  it("translates by the centre", () => {
    const f = frame([10, -5], 90);
    expect(framePoint(f, [0, 0])).toEqual([10, -5]);
    expect(framePoint(f, [1, 2])[0]).toBeCloseTo(11, 9);
    expect(framePoint(f, [1, 2])[1]).toBeCloseTo(-3, 9);
  });

  it("turns local +y to the axis and local +x ninety degrees to its left", () => {
    const f = frame([0, 0], 0); // local +y points along world +x
    expect(framePoint(f, [0, 1])[0]).toBeCloseTo(1, 9);
    expect(framePoint(f, [0, 1])[1]).toBeCloseTo(0, 9);
    expect(framePoint(f, [1, 0])[0]).toBeCloseTo(0, 9);
    expect(framePoint(f, [1, 0])[1]).toBeCloseTo(-1, 9);
  });

  it("turns end for end without moving the centre", () => {
    const f = frame([4, 7], 90);
    const back = reverseFrame(f);
    expect(back.centre).toEqual(f.centre);
    expect(framePoint(back, [3, 5])[0]).toBeCloseTo(1, 9);
    expect(framePoint(back, [3, 5])[1]).toBeCloseTo(2, 9);
    expect(frameAngle(back, 0)).toBe(frameAngle(f, 0) + 180);
  });

  it("keeps distances, whatever the axis", () => {
    for (const axis of [0, 37, 90, 180, 271]) {
      const f = frame([12, -3], axis);
      expect(dist(framePoint(f, [1, 2]), framePoint(f, [-4, 6]))).toBeCloseTo(Math.hypot(5, 4), 9);
    }
  });

  it("maps a vector without the translation", () => {
    const f = frame([100, 100], 90);
    expect(frameVector(f, [3, 4])[0]).toBeCloseTo(3, 9);
    expect(frameVector(f, [3, 4])[1]).toBeCloseTo(4, 9);
  });
});
