import { describe, expect, it } from "vitest";
import { dirOf } from "../geometry/Angle.js";
import type { PoseSample } from "./PoseSample.js";
import { SHOULDER_FORWARD_PX, SHOULDER_WIDTH_PX } from "./RenderingContract.js";
import { shoulders, shouldersAt } from "./shoulders.js";

const sample = (p: [number, number], facing: number): PoseSample => ({
  p,
  facing,
  look: facing,
  lean: 0,
  hands: { L: "down", R: "down" },
  stepRate: 1,
  buzz: false,
  flare: 0,
  amp: 1,
});

describe("shoulders", () => {
  it("are exactly 11 px apart at every facing", () => {
    for (let a = -360; a <= 360; a += 11) {
      const s = shoulders(sample([3, -7], a));
      expect(Math.hypot(s.L[0] - s.R[0], s.L[1] - s.R[1])).toBeCloseTo(SHOULDER_WIDTH_PX, 12);
    }
  });

  it("rotate with the facing, L on the dancer's left", () => {
    // Facing +x in an overhead view with y down: the dancer's left is -y.
    const s = shoulders(sample([0, 0], 0));
    expect(s.L[1]).toBeLessThan(s.R[1]);
    expect(s.L[0]).toBeCloseTo(SHOULDER_FORWARD_PX, 12);
    expect(s.L[1]).toBeCloseTo(-SHOULDER_WIDTH_PX / 2, 12);
    expect(s.R[1]).toBeCloseTo(SHOULDER_WIDTH_PX / 2, 12);

    const turned = shoulders(sample([0, 0], 180));
    expect(turned.L[1]).toBeGreaterThan(turned.R[1]);
  });

  it("sit 0.3 px ahead of the body centre", () => {
    for (const a of [0, 45, 137, -90]) {
      const s = shoulders(sample([2, 2], a));
      const mid: [number, number] = [(s.L[0] + s.R[0]) / 2, (s.L[1] + s.R[1]) / 2];
      const d = dirOf(a);
      expect((mid[0] - 2) * d[0] + (mid[1] - 2) * d[1]).toBeCloseTo(SHOULDER_FORWARD_PX, 12);
    }
  });

  it("takes the torso sway when the renderer supplies it", () => {
    const plain = shoulders(sample([0, 0], 0));
    const swayed = shoulders(sample([0, 0], 0), 1.5);
    expect(swayed.L[0]).not.toBeCloseTo(plain.L[0], 6);
    // Still 11 px apart.
    expect(Math.hypot(swayed.L[0] - swayed.R[0], swayed.L[1] - swayed.R[1])).toBeCloseTo(
      SHOULDER_WIDTH_PX,
      12,
    );
    expect(swayed).toEqual(shouldersAt([0, 0], 1.5));
  });
});
