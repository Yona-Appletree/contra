import { describe, expect, it } from "vitest";
import { dirOf, leftOf, rightOf } from "../geometry/Angle.js";
import type { Vec2 } from "../geometry/Vec2.js";
import { planarReach, solveArm, solveArm3d } from "./Arm.js";
import type { Hand, Side } from "./PoseSample.js";
import { ARM_REACH_PX, FOREARM_PX, UPPER_ARM_PX } from "./RenderingContract.js";

/** Seeded PRNG so a failing case can be reproduced from the printed seed. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = 500;

const dist3 = (a: Vec2, az: number, b: Vec2, bz: number): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], az - bz);

/** How far the elbow bows toward `outward`, measured across the shoulder-hand line. */
function outwardness(s: { shoulder: Vec2; elbow: Vec2; hand: Vec2 }, outward: Vec2): number {
  const line: Vec2 = [s.hand[0] - s.shoulder[0], s.hand[1] - s.shoulder[1]];
  const l = Math.hypot(line[0], line[1]) || 1;
  const u: Vec2 = [line[0] / l, line[1] / l];
  const e: Vec2 = [s.elbow[0] - s.shoulder[0], s.elbow[1] - s.shoulder[1]];
  const along = e[0] * u[0] + e[1] * u[1];
  return (e[0] - along * u[0]) * outward[0] + (e[1] - along * u[1]) * outward[1];
}

describe("planarReach", () => {
  it("is sqrt(15^2 - drop^2)", () => {
    expect(planarReach(0)).toBe(ARM_REACH_PX);
    expect(planarReach(5)).toBeCloseTo(Math.sqrt(225 - 25), 12);
    expect(planarReach(14)).toBeCloseTo(Math.sqrt(225 - 196), 12);
    expect(planarReach(15)).toBe(0);
  });

  it("is 0 rather than NaN for a drop past the reach", () => {
    expect(planarReach(20)).toBe(0);
  });
});

describe("solveArm: reachable targets (property, 500 cases)", () => {
  it("reports short = 0 and keeps both bones at exactly 7.5 px in 3D", () => {
    const seed = 0x5eed_2c04;
    const rng = mulberry32(seed);
    for (let i = 0; i < CASES; i++) {
      const shoulder: Vec2 = [rng() * 200 - 100, rng() * 200 - 100];
      const facing = rng() * 720 - 360;
      const side: Side = rng() < 0.5 ? "L" : "R";
      const drop = rng() * 14.5;
      // A floor point strictly inside the planar reach at this drop, and far
      // enough from the shoulder that the IK is not degenerate.
      const reach = planarReach(drop);
      const r = 0.05 + rng() * (reach - 0.05);
      const theta = rng() * 360;
      const d = dirOf(theta);
      const hand: Hand = { p: [shoulder[0] + d[0] * r, shoulder[1] + d[1] * r], drop };

      const s = solveArm3d(shoulder, hand, side, facing);
      const why = `seed=${seed} case=${i} shoulder=${shoulder} facing=${facing} side=${side} drop=${drop} r=${r}`;

      expect(s.short, why).toBe(0);
      expect(s.hand[0], why).toBeCloseTo(hand.p[0], 12);
      expect(s.hand[1], why).toBeCloseTo(hand.p[1], 12);
      expect(dist3(s.elbow, s.elbowZ, s.shoulder, 0), why).toBeCloseTo(UPPER_ARM_PX, 6);
      expect(dist3(s.hand, s.handZ, s.elbow, s.elbowZ), why).toBeCloseTo(FOREARM_PX, 6);
    }
  });
});

describe("solveArm: unreachable targets (property, 500 cases)", () => {
  it("reports the shortfall and puts the hand on the segment toward the target", () => {
    const seed = 0x5eed_2c05;
    const rng = mulberry32(seed);
    for (let i = 0; i < CASES; i++) {
      const shoulder: Vec2 = [rng() * 200 - 100, rng() * 200 - 100];
      const facing = rng() * 720 - 360;
      const side: Side = rng() < 0.5 ? "L" : "R";
      const drop = rng() * ARM_REACH_PX;
      const reach = planarReach(drop);
      const over = 0.01 + rng() * 40;
      const r = reach + over;
      const theta = rng() * 360;
      const d = dirOf(theta);
      const target: Vec2 = [shoulder[0] + d[0] * r, shoulder[1] + d[1] * r];
      const hand: Hand = { p: target, drop };

      const s = solveArm3d(shoulder, hand, side, facing);
      const d3 = Math.hypot(r, drop);
      const why = `seed=${seed} case=${i} r=${r} drop=${drop}`;

      expect(s.short, why).toBeGreaterThan(0);
      expect(s.short, why).toBeCloseTo(d3 - ARM_REACH_PX, 9);

      // On the segment from shoulder toward the target: same direction, shorter.
      const toHand: Vec2 = [s.hand[0] - shoulder[0], s.hand[1] - shoulder[1]];
      const handR = Math.hypot(toHand[0], toHand[1]);
      expect(handR, why).toBeLessThan(r);
      expect(toHand[0] / handR, why).toBeCloseTo(d[0], 9);
      expect(toHand[1] / handR, why).toBeCloseTo(d[1], 9);

      // The whole 3D target vector is scaled back to 15 px, so the drop shrinks
      // with it and the hand ends at the planar reach for the *clamped* drop.
      expect(Math.hypot(handR, s.handZ), why).toBeCloseTo(ARM_REACH_PX, 9);
      expect(handR, why).toBeCloseTo(planarReach(-s.handZ), 9);

      // The arm is straight, so both bones still measure 7.5 px in 3D.
      expect(dist3(s.elbow, s.elbowZ, s.shoulder, 0), why).toBeCloseTo(UPPER_ARM_PX, 6);
      expect(dist3(s.hand, s.handZ, s.elbow, s.elbowZ), why).toBeCloseTo(FOREARM_PX, 6);
    }
  });
});

describe("solveArm: the elbow pole", () => {
  it("puts the elbow's floor projection outward of the shoulder-hand line, both sides", () => {
    const seed = 0x5eed_2c06;
    const rng = mulberry32(seed);
    for (let i = 0; i < CASES; i++) {
      const shoulder: Vec2 = [rng() * 40 - 20, rng() * 40 - 20];
      const facing = rng() * 360;
      const drop = 1 + rng() * 12;
      const reach = planarReach(drop);
      const r = 1 + rng() * (reach - 1.5);
      const theta = rng() * 360;
      const d = dirOf(theta);
      const hand: Hand = { p: [shoulder[0] + d[0] * r, shoulder[1] + d[1] * r], drop };

      for (const side of ["L", "R"] as const) {
        const s = solveArm(shoulder, hand, side, facing);
        const outward = side === "L" ? leftOf(facing) : rightOf(facing);
        const why = `seed=${seed} case=${i} side=${side} facing=${facing} theta=${theta}`;
        // Never inward. It is exactly zero only when the arm points straight
        // along the outward direction, where the pole has no floor component.
        expect(outwardness(s, outward), why).toBeGreaterThanOrEqual(-1e-12);
      }
    }
  });

  it("never puts the elbow inward, even for a hand across the body", () => {
    // Facing +x, so the dancer's left is -y and right is +y. Both arms reach
    // across to the other side; the elbow must still bow outward.
    expect(
      outwardness(solveArm([0, -5.5], { p: [6, 4], drop: 4 }, "L", 0), [0, -1]),
    ).toBeGreaterThan(0);
    expect(
      outwardness(solveArm([0, 5.5], { p: [6, -4], drop: 4 }, "R", 0), [0, 1]),
    ).toBeGreaterThan(0);
  });
});

describe("solveArm: degenerate target", () => {
  it("keeps the upper arm at 7.5 px when the hand is at the shoulder", () => {
    const s = solveArm3d([3, -2], { p: [3, -2], drop: 0 }, "L", 37);
    expect(Math.hypot(s.elbow[0] - 3, s.elbow[1] + 2, s.elbowZ)).toBeCloseTo(UPPER_ARM_PX, 12);
    expect(s.short).toBe(0);
  });
});

/**
 * Golden fixtures ported from `spikes/two-dancers/index.html`, computed by
 * retyping its `solveArm`, `bodyPt`, `leftOf`, `rightOf` and `hang` into a
 * throwaway node script and running it. See `packages/core/README.md` for the
 * formulas each case comes from. The spike's shoulder half-width (`SHW = 5.2`)
 * is used for the shoulder inputs here, deliberately, so these fixtures test
 * the solver rather than this package's 11 px shoulder constant.
 */
describe("solveArm: golden fixtures from the two-dancers spike", () => {
  const P = 9; // px of agreement demanded with the spike

  it("hold-left: two-hand hold, lark's left arm, 14 px spacing", () => {
    // figWalkIn at take = 1: shoulder bodyPt([-7,0], 0, 0.3, -5.2);
    // hand add([0,0], leftOf(0), 4.5) at drop HOLD_D = 5.
    const s = solveArm3d([-6.7, -5.2], { p: [0, -4.5], drop: 5 }, "L", 0);
    expect(s.elbow[0]).toBeCloseTo(-6.081653545905, P);
    expect(s.elbow[1]).toBeCloseTo(-8.555120676848, P);
    expect(s.hand[0]).toBeCloseTo(0, P);
    expect(s.hand[1]).toBeCloseTo(-4.5, P);
    expect(s.short).toBe(0);
    expect(s.reach).toBeCloseTo(14.142135623731, P);
    expect(s.elbowZ).toBeCloseTo(-6.679132646272, P);
    expect(s.handZ).toBeCloseTo(-5, P);
  });

  it("hang-right: hand hanging at rest, drop 14", () => {
    // hang([-7,0], 0, +1, ph, amp = 0) => p = bodyPt(P, 0, 0.4, 6.2), d = HANG_D = 14;
    // shoulder bodyPt([-7,0], 0, 0.3, +5.2).
    const s = solveArm3d([-6.7, 5.2], { p: [-6.6, 6.2], drop: 14 }, "R", 0);
    expect(s.elbow[0]).toBeCloseTo(-6.690921591127, P);
    expect(s.elbow[1]).toBeCloseTo(8.338261385864, P);
    expect(s.hand[0]).toBeCloseTo(-6.6, P);
    expect(s.hand[1]).toBeCloseTo(6.2, P);
    expect(s.short).toBe(0);
    expect(s.reach).toBeCloseTo(5.385164807135, P);
    expect(s.elbowZ).toBeCloseTo(-6.811845055232, P);
    expect(s.handZ).toBeCloseTo(-14, P);
  });

  it("overreach-left: still out at D0 = 32, reaching the hold point", () => {
    // Same hold point, dancer still at the lines: bodyPt([-16,0], 0, 0.3, -5.2).
    const s = solveArm3d([-15.7, -5.2], { p: [0, -4.5], drop: 5 }, "L", 0);
    expect(s.elbow[0]).toBeCloseTo(-8.560095036661, P);
    expect(s.elbow[1]).toBeCloseTo(-4.881660288259, P);
    expect(s.hand[0]).toBeCloseTo(-1.420190073323, P);
    expect(s.hand[1]).toBeCloseTo(-4.563320576518, P);
    expect(s.short).toBeCloseTo(1.491816152262, P);
    expect(s.reach).toBeCloseTo(14.142135623731, P);
    expect(s.elbowZ).toBeCloseTo(-2.273855083866, P);
    expect(s.handZ).toBeCloseTo(-4.547710167732, P);
  });
});

describe("solveArm", () => {
  it("returns only the projected solution, without heights", () => {
    const s = solveArm([-6.7, -5.2], { p: [0, -4.5], drop: 5 }, "L", 0);
    expect(Object.keys(s).sort()).toEqual(["elbow", "hand", "short", "shoulder"]);
  });
});
