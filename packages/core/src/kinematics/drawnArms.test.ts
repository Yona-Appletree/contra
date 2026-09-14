import { describe, expect, it } from "vitest";
import { ARM_REACH_PX, FOREARM_PX, UPPER_ARM_PX } from "./RenderingContract.js";
import { dirOf } from "../geometry/Angle.js";
import { dist } from "../geometry/Vec2.js";
import type { PoseSample } from "./PoseSample.js";
import { shouldersAt } from "./shoulders.js";
import { solveArm } from "./Arm.js";
import {
  ELBOW_TUCK_DROP_PX,
  ELBOW_TUCK_PLANAR_PX,
  HAND_HANG_DROP_PX,
  HAND_HANG_FORWARD_PX,
  HAND_HANG_LATERAL_PX,
  HAND_HANG_SWING_PX,
  drawnArms,
  elbowPole,
  hangingHand,
} from "./drawnArms.js";

/**
 * The resting-arm model, which F3a moved down here out of `@caller/hall` so
 * the renderer, the figure library and the motion oracle all read one copy.
 * `@caller/hall`'s `layoutDancer.test.ts` still measures the silhouette these
 * numbers produce; this file is the model's own contract.
 */

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

describe("the hanging hand", () => {
  it("hangs beside the hip, inside the arm's reach", () => {
    const hand = hangingHand([0, 0], 0, "L", 0, 0);
    expect(hand.drop).toBe(HAND_HANG_DROP_PX);
    expect(hand.drop).toBeLessThan(ARM_REACH_PX);
    expect(hand.p[0]).toBeCloseTo(HAND_HANG_FORWARD_PX, 12);
    expect(hand.p[1]).toBeCloseTo(-HAND_HANG_LATERAL_PX, 12);
  });

  it("swings forward and back with the step, and not at all at zero amplitude", () => {
    const forwards: number[] = [];
    for (let n = 0; n < 16; n++) forwards.push(hangingHand([0, 0], 0, "R", n / 8, 1).p[0]);
    expect(Math.max(...forwards) - Math.min(...forwards)).toBeCloseTo(2 * HAND_HANG_SWING_PX, 9);
    for (let n = 0; n < 16; n++) {
      expect(hangingHand([0, 0], 0, "R", n / 8, 0).p[0]).toBeCloseTo(HAND_HANG_FORWARD_PX, 12);
    }
  });

  it("is always within reach, at any facing and any step phase", () => {
    for (const facing of [0, 37, 180, 299]) {
      for (let n = 0; n < 8; n++) {
        for (const side of ["L", "R"] as const) {
          const hand = hangingHand([3, -4], facing, side, n / 8, 1);
          const sh = shouldersAt([3, -4], facing);
          expect(solveArm(sh[side], hand, side, facing).short).toBe(0);
        }
      }
    }
  });
});

describe("the elbow pole", () => {
  it("points backward for a hand hanging under the shoulder", () => {
    const sh = shouldersAt([0, 0], 0);
    const pole = elbowPole(sh.L, hangingHand([0, 0], 0, "L", 0, 0), "L", 0);
    // Facing is +x, so "backward" is a negative x component.
    expect(pole[0]).toBeLessThan(0);
  });

  it("points outward for a hand reaching well away from the body", () => {
    const sh = shouldersAt([0, 0], 0);
    const pole = elbowPole(sh.L, { p: [0, -12], drop: 2 }, "L", 0);
    const outward = dirOf(-90);
    expect(pole[0] * outward[0] + pole[1] * outward[1]).toBeGreaterThan(0);
  });

  it("swings from outward to backward continuously as the hand comes in", () => {
    const sh = shouldersAt([0, 0], 0);
    let previous = elbowPole(sh.L, { p: [0, -20], drop: ELBOW_TUCK_DROP_PX }, "L", 0);
    for (let n = 1; n <= 80; n++) {
      const hand = { p: [0, -20 + n * 0.25] as const, drop: ELBOW_TUCK_DROP_PX };
      const pole = elbowPole(sh.L, hand, "L", 0);
      expect(dist(pole, previous)).toBeLessThan(0.1);
      previous = pole;
    }
    expect(ELBOW_TUCK_PLANAR_PX).toBeGreaterThan(0);
  });
});

describe("drawnArms", () => {
  it("solves both bones to 7.5 px in three dimensions", () => {
    const drawn = drawnArms(pose({ hands: { L: { p: [4, -8], drop: 5 }, R: "down" } }), 0.25);
    for (const [i, side] of ([0, 1] as const).map((i) => [i, i === 0 ? "L" : "R"] as const)) {
      const arm = drawn.arms[i]!;
      const shoulder = drawn.shoulders[side];
      expect(
        Math.hypot(arm.elbow[0] - shoulder[0], arm.elbow[1] - shoulder[1], arm.elbowZ),
      ).toBeCloseTo(UPPER_ARM_PX, 9);
      expect(
        Math.hypot(arm.hand[0] - arm.elbow[0], arm.hand[1] - arm.elbow[1], arm.handZ - arm.elbowZ),
      ).toBeCloseTo(FOREARM_PX, 9);
    }
  });

  it("fills a 'down' hand in from the hang and says which hands are hanging", () => {
    const drawn = drawnArms(pose({ hands: { L: { p: [4, -8], drop: 5 }, R: "down" } }), 0.25);
    expect(drawn.hanging).toEqual({ L: false, R: true });
    expect(drawn.hands.R).toEqual(hangingHand([0, 0], 0, "R", 0.25, 1));
    expect(drawn.hands.L).toEqual({ p: [4, -8], drop: 5 });
  });

  it("hangs the hand off the plain facing and the shoulders off the torso angle", () => {
    const drawn = drawnArms(pose(), 0, [1, 2], 30);
    expect(drawn.hands.L).toEqual(hangingHand([1, 2], 0, "L", 0, 1));
    expect(drawn.shoulders).toEqual(shouldersAt([1, 2], 30));
  });
});
