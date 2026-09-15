import { describe, expect, it } from "vitest";
import { ARM_REACH_PX } from "./RenderingContract.js";
import { dirOf } from "../geometry/Angle.js";
import type { Vec2 } from "../geometry/Vec2.js";
import { dist } from "../geometry/Vec2.js";
import type { PoseSample } from "./PoseSample.js";
import { shouldersAt } from "./shoulders.js";
import { armShortfall } from "./armShortfall.js";

/**
 * The probe every figure's own test runs over its whole length: plan AC1 is
 * `short === 0` at every eighth of a beat, so what this file pins is that a
 * hand inside the reach reads exactly 0 and a hand outside it reads the gap.
 */

const STILL: Vec2 = [0, 0];

const pose = (extra: Partial<PoseSample> = {}): PoseSample => ({
  p: [0, 0],
  facing: 0,
  look: 0,
  lean: 0,
  hands: { L: "down", R: "down" },
  stepRate: 1,
  buzz: false,
  flare: 0,
  amp: 1,
  ...extra,
});

const outToTheLeft = (out: number): PoseSample =>
  pose({ hands: { L: { p: [0, -out] as Vec2, drop: 0 }, R: "down" } });

describe("armShortfall", () => {
  it("is zero for a dancer standing with both hands down, at every step phase", () => {
    for (let n = 0; n < 16; n++) {
      const check = armShortfall(pose(), n / 8, STILL);
      expect(check.L).toBe(0);
      expect(check.R).toBe(0);
    }
  });

  it("is zero at any facing, walking as well as standing", () => {
    for (let a = 0; a < 360; a += 15) {
      const d = dirOf(a);
      const check = armShortfall(pose({ facing: a }), 0.375, [d[0] * 3, d[1] * 3]);
      expect(check.L).toBe(0);
      expect(check.R).toBe(0);
    }
  });

  it("is zero for a hand the figure places within reach", () => {
    const hold = { p: [0, -4.5] as Vec2, drop: 5 };
    const check = armShortfall(pose({ hands: { L: hold, R: "down" } }), 0, STILL);
    expect(check.L).toBe(0);
    expect(check.R).toBe(0);
  });

  it("reports the gap, on the side it is on, for a hand the arm cannot reach", () => {
    const far = outToTheLeft(ARM_REACH_PX + 6);
    const check = armShortfall(far, 0, STILL);
    expect(check.R).toBe(0);
    // A hand at shoulder height is short by however far past the 15 px reach it
    // is, measured from the shoulder the arm hangs off — not from the body.
    const hand = far.hands.L;
    if (hand === "down") throw new Error("unreachable");
    expect(check.L).toBeCloseTo(dist(shouldersAt([0, 0], 0).L, hand.p) - ARM_REACH_PX, 9);
  });

  it("grows as the hand goes further out of reach", () => {
    const short = (out: number): number => armShortfall(outToTheLeft(out), 0, STILL).L;
    expect(short(21)).toBeGreaterThan(0);
    expect(short(25)).toBeGreaterThan(short(21));
    expect(short(30)).toBeGreaterThan(short(25));
  });
});
