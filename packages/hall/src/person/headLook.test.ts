import { describe, expect, it } from "vitest";
import { HEAD_TURN_LIMIT_DEG, HEAD_TURN_RELEASE_DEG, headLook } from "./headLook.js";

describe("headLook", () => {
  it("follows the look exactly inside the limit", () => {
    expect(headLook(90, 120)).toBeCloseTo(120, 10);
    expect(headLook(90, 90 - HEAD_TURN_LIMIT_DEG)).toBeCloseTo(90 - HEAD_TURN_LIMIT_DEG, 10);
  });

  it("clamps to the limit just past it, then fades to the facing", () => {
    const justPast = headLook(0, HEAD_TURN_LIMIT_DEG + 6);
    expect(justPast).toBeLessThan(HEAD_TURN_LIMIT_DEG);
    expect(justPast).toBeGreaterThan(HEAD_TURN_LIMIT_DEG - 6);
    expect(headLook(0, HEAD_TURN_RELEASE_DEG - 0.001)).toBeCloseTo(0, 2);
  });

  it("gives up and faces forward beyond the release angle", () => {
    expect(headLook(0, 150)).toBe(0);
    expect(headLook(0, 180)).toBe(0);
    expect(headLook(0, -150)).toBe(0);
  });

  it("is continuous across both thresholds", () => {
    for (const edge of [HEAD_TURN_LIMIT_DEG, HEAD_TURN_RELEASE_DEG]) {
      const below = headLook(0, edge - 0.001);
      const above = headLook(0, edge + 0.001);
      expect(Math.abs(above - below)).toBeLessThan(0.01);
    }
  });

  it("turns both ways symmetrically and wraps", () => {
    expect(headLook(0, 70)).toBeCloseTo(-headLook(0, -70), 10);
    expect(headLook(350, 20)).toBeCloseTo(380, 10);
  });
});
