import { describe, expect, it } from "vitest";
import type { Vec2 } from "../geometry/Vec2.js";
import { FOOT_SWING_PX } from "./RenderingContract.js";
import {
  BUZZ_PIVOT_FOOT,
  BUZZ_STEPS_PER_BEAT,
  BUZZ_SWING_PX,
  BUZZ_TRAILING_FOOT,
  FOOT_REST_FORWARD_PX,
  FOOT_REST_LATERAL_PX,
  FULL_AMPLITUDE_SPEED,
} from "./quietMotion.js";
import { swingFeet } from "./swingFeet.js";

// Facing 0° is +x, so the dancer's right is +y: a dancer walking straight
// forward at full amplitude has `vu = 1` and `vw = 0`, which is the simplest
// case to read the numbers off.
const FORWARD: Vec2 = [FULL_AMPLITUDE_SPEED, 0];
// A quarter of a buzz-step period in, where both the walking swing and the
// buzz push are at their peak.
const PEAK = 1 / (4 * BUZZ_STEPS_PER_BEAT);

/** The blend is a lerp, so a foot at buzz 1 is the buzz foot to rounding. */
const expectPointClose = (got: Vec2, want: Vec2): void => {
  expect(got[0]).toBeCloseTo(want[0], 12);
  expect(got[1]).toBeCloseTo(want[1], 12);
};

describe("swingFeet", () => {
  it("is the walking pair at buzz 0", () => {
    const feet = swingFeet(PEAK, 0, FORWARD, 0);
    expect(feet.L).toEqual([FOOT_REST_FORWARD_PX + FOOT_SWING_PX, -FOOT_REST_LATERAL_PX]);
    expect(feet.R).toEqual([FOOT_REST_FORWARD_PX - FOOT_SWING_PX, FOOT_REST_LATERAL_PX]);
  });

  it("is the buzz pair at buzz 1: one foot pivoting, one trailing", () => {
    const feet = swingFeet(PEAK, 0, FORWARD, 1);
    expectPointClose(feet.L, [BUZZ_PIVOT_FOOT[0] + BUZZ_SWING_PX, BUZZ_PIVOT_FOOT[1]]);
    expectPointClose(feet.R, BUZZ_TRAILING_FOOT);
    // The trailing foot does not move with the step at all, all the way round.
    for (let n = 0; n < 16; n++) {
      expectPointClose(swingFeet(n / 8, 0, FORWARD, 1).R, BUZZ_TRAILING_FOOT);
    }
  });

  it("crosses from one to the other, half way at buzz 0.5", () => {
    const walking = swingFeet(PEAK, 0, FORWARD, 0);
    const buzzing = swingFeet(PEAK, 0, FORWARD, 1);
    const half = swingFeet(PEAK, 0, FORWARD, 0.5);
    expectPointClose(half.L, [
      (walking.L[0] + buzzing.L[0]) / 2,
      (walking.L[1] + buzzing.L[1]) / 2,
    ]);
    expectPointClose(half.R, [
      (walking.R[0] + buzzing.R[0]) / 2,
      (walking.R[1] + buzzing.R[1]) / 2,
    ]);
  });

  it("stands still when the dancer is not travelling", () => {
    const feet = swingFeet(PEAK, 0, [0, 0], 0);
    expect(feet.L).toEqual([FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX]);
    expect(feet.R).toEqual([FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX]);
  });

  it("swings the feet along the way the dancer is going, not the way they face", () => {
    // Sideways travel at full speed: the step goes into the lateral offset
    // instead of the forward one, which is what a buzz round a centre needs.
    const sideways: Vec2 = [0, FULL_AMPLITUDE_SPEED];
    const feet = swingFeet(PEAK, 0, sideways, 0);
    expect(feet.L).toEqual([FOOT_REST_FORWARD_PX, -FOOT_REST_LATERAL_PX + FOOT_SWING_PX]);
    expect(feet.R).toEqual([FOOT_REST_FORWARD_PX, FOOT_REST_LATERAL_PX - FOOT_SWING_PX]);
  });

  it("scales the step down with the speed, and never past full amplitude", () => {
    const halfSpeed = swingFeet(PEAK, 0, [FULL_AMPLITUDE_SPEED / 2, 0], 0);
    expect(halfSpeed.L[0]).toBeCloseTo(FOOT_REST_FORWARD_PX + FOOT_SWING_PX / 2, 12);
    const tooFast = swingFeet(PEAK, 0, [FULL_AMPLITUDE_SPEED * 3, 0], 0);
    expect(tooFast.L[0]).toBeCloseTo(FOOT_REST_FORWARD_PX + FOOT_SWING_PX, 12);
  });
});
