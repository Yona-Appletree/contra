import {
  FOREARM_PX,
  RENDERING_CONTRACT,
  SHOULDER_WIDTH_PX,
  TORSO_SWAY_DEG,
  UPPER_ARM_PX,
  dist,
} from "@caller/core";
import type { PoseSample } from "@caller/core";
import { describe, expect, it } from "vitest";
import { HAND_HANG_DROP_PX, hangingHand, layoutDancer } from "./layoutDancer.js";
import { createPerson } from "./Person.js";

const person = createPerson({ id: "a", role: "lark", seed: 1, skirt: false });

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

describe("layoutDancer", () => {
  it("quantises the body position to 1/256 px", () => {
    const layout = layoutDancer({ person, pose: pose({ p: [1.0001, -2.7777] }) }, 0);
    for (const v of layout.p) {
      expect(v * 256).toBeCloseTo(Math.round(v * 256), 10);
    }
    expect(RENDERING_CONTRACT.positionQuantumPx).toBe(1 / 256);
  });

  it("snaps to whole px when the renderer asks it to", () => {
    const layout = layoutDancer({ person, pose: pose({ p: [1.6, -2.4] }) }, 0, (v) => [
      Math.round(v[0]),
      Math.round(v[1]),
    ]);
    expect(layout.p).toEqual([2, -2]);
  });

  it("keeps both bones their contract length, whatever the hands are doing", () => {
    for (const target of [
      { p: [0, 0], drop: 0 },
      { p: [3, -2], drop: 5 },
      { p: [40, 40], drop: 5 },
      { p: [0, 0], drop: 14 },
    ] as const) {
      const layout = layoutDancer(
        { person, pose: pose({ hands: { L: target, R: target } }) },
        0.25,
      );
      for (const arm of layout.arms) {
        const upper = Math.hypot(
          arm.elbow[0] - arm.shoulder[0],
          arm.elbow[1] - arm.shoulder[1],
          arm.elbowZ,
        );
        const fore = Math.hypot(
          arm.hand[0] - arm.elbow[0],
          arm.hand[1] - arm.elbow[1],
          arm.handZ - arm.elbowZ,
        );
        expect(upper).toBeCloseTo(UPPER_ARM_PX, 6);
        expect(fore).toBeCloseTo(FOREARM_PX, 6);
      }
    }
  });

  it("hangs the shoulders the contract's width apart, on the swaying torso", () => {
    const moving = layoutDancer({ person, pose: pose({ p: [0, 0] }), velocity: [8, 0] }, 0.25);
    const [left, right] = moving.arms;
    expect(dist(left.shoulder, right.shoulder)).toBeCloseTo(SHOULDER_WIDTH_PX, 10);
    expect(Math.abs(moving.sway)).toBeCloseTo(TORSO_SWAY_DEG, 10);
    expect(moving.torsoAngle).toBeCloseTo(moving.pose.facing + moving.sway, 10);
  });

  it("plants the feet and stops the sway for a dancer standing still", () => {
    const still = layoutDancer({ person, pose: pose() }, 3.5);
    expect(still.sway).toBe(0);
    expect(still.feet.L[0]).toBeCloseTo(still.feet.R[0], 10);
  });

  it("fills in a hanging hand for a hand the figure does not place", () => {
    const layout = layoutDancer({ person, pose: pose() }, 0);
    expect(layout.hands.L.drop).toBe(HAND_HANG_DROP_PX);
    expect(layout.hands.L).toEqual(hangingHand([0, 0], 0, "L", 0, 1));
    // The dancer's left is −y when facing 0°.
    expect(layout.hands.L.p[1]).toBeLessThan(0);
    expect(layout.hands.R.p[1]).toBeGreaterThan(0);
  });

  it("keeps a hand the figure does place, exactly", () => {
    const hand = { p: [2, -3] as const, drop: 5 };
    const layout = layoutDancer({ person, pose: pose({ hands: { L: hand, R: "down" } }) }, 0);
    expect(layout.hands.L).toBe(hand);
  });
});
