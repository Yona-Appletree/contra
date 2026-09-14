import {
  FOREARM_PX,
  RENDERING_CONTRACT,
  SHOULDER_WIDTH_PX,
  TORSO_SWAY_DEG,
  UPPER_ARM_PX,
  dirOf,
  dist,
  rightOf,
} from "@caller/core";
import type { PoseSample, Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import { TORSO_HALF_DEPTH_PX, TORSO_HALF_WIDTH_PX } from "./drawPerson.js";
import type { DancerLayout } from "./layoutDancer.js";
import {
  HAND_HANG_DROP_PX,
  HAND_HANG_SWING_PX,
  elbowPole,
  hangingHand,
  layoutDancer,
} from "./layoutDancer.js";
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

/**
 * Gate G1: "Humans don't usually hold their arms out when resting. You can't
 * see much arm when someone is just standing there." The three numbers below
 * are the milestone's targets, measured on `layoutDancer` for a dancer with
 * both hands `'down'` — at rest and, more strictly than the brief asks, at
 * every quarter of a walking beat as well.
 */
describe("the resting arm (gate G1)", () => {
  const angles = [0, 37, 90, 211, 300];
  const phases = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];

  /** Every resting layout the targets have to hold for. */
  function* resting(): Generator<{ layout: DancerLayout; what: string }> {
    for (const facing of angles) {
      for (const amp of [0, 1]) {
        for (const beat of phases) {
          yield {
            layout: layoutDancer({ person, pose: pose({ facing, amp, p: [3, -4] }) }, beat),
            what: `facing ${facing}, amp ${amp}, beat ${beat}`,
          };
        }
      }
    }
  }

  /** A world point in body-local px: `[forward, right]`. */
  function local(q: Vec2, layout: DancerLayout): Vec2 {
    const d = dirOf(layout.torsoAngle);
    const r = rightOf(layout.torsoAngle);
    const dx = q[0] - layout.p[0];
    const dy = q[1] - layout.p[1];
    return [dx * d[0] + dy * d[1], dx * r[0] + dy * r[1]];
  }

  /** Distance from a body-local point to the torso ellipse, positive outside. */
  function torsoGap(u: number, w: number): number {
    let best = Infinity;
    for (let i = 0; i < 20000; i++) {
      const t = (i / 20000) * Math.PI * 2;
      best = Math.min(
        best,
        Math.hypot(TORSO_HALF_DEPTH_PX * Math.cos(t) - u, TORSO_HALF_WIDTH_PX * Math.sin(t) - w),
      );
    }
    const inside = (u / TORSO_HALF_DEPTH_PX) ** 2 + (w / TORSO_HALF_WIDTH_PX) ** 2 <= 1;
    return inside ? -best : best;
  }

  it("is at most 13 px wide, shoulders included", () => {
    for (const { layout, what } of resting()) {
      let half = 0;
      for (const arm of layout.arms) {
        for (const q of [arm.shoulder, arm.elbow, arm.hand]) {
          half = Math.max(half, Math.abs(local(q, layout)[1]));
        }
      }
      expect(half * 2, `silhouette width, ${what}`).toBeLessThanOrEqual(13);
    }
  });

  it("keeps the elbow within 1.5 px of the torso outline", () => {
    for (const { layout, what } of resting()) {
      for (const arm of layout.arms) {
        const [u, w] = local(arm.elbow, layout);
        expect(torsoGap(u, w), `elbow gap, ${what}`).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it("hangs the hand beside the hip", () => {
    const half = SHOULDER_WIDTH_PX / 2;
    // At the far end of the walking arm swing the hand reaches exactly 1 px
    // forward (0.4 + 0.6), so the bound is met to the last bit and the epsilon
    // is float noise from rotating the point into world space, not slack.
    const eps = 1e-9;
    for (const { layout, what } of resting()) {
      for (const arm of layout.arms) {
        const [forward, right] = local(arm.hand, layout);
        expect(Math.abs(right), `hand lateral, ${what}`).toBeLessThanOrEqual(half + 0.5 + eps);
        expect(forward, `hand forward, ${what}`).toBeGreaterThanOrEqual(-1 - eps);
        expect(forward, `hand forward, ${what}`).toBeLessThanOrEqual(1 + eps);
      }
    }
  });

  it("never asks for more arm than there is", () => {
    for (const { layout, what } of resting()) {
      for (const arm of layout.arms) {
        expect(arm.short, `short, ${what}`).toBe(0);
      }
    }
  });

  it("tucks the elbow behind the shoulder rather than winging it out", () => {
    const layout = layoutDancer({ person, pose: pose() }, 0);
    for (const arm of layout.arms) {
      // Behind the shoulder line, and no further out than the hand.
      expect(local(arm.elbow, layout)[0]).toBeLessThan(local(arm.shoulder, layout)[0]);
      expect(elbowPole(arm.shoulder, layout.hands.L, "L", layout.torsoAngle)).toHaveLength(2);
    }
  });

  it("still swings the hanging hands with the step", () => {
    const front = layoutDancer({ person, pose: pose({ amp: 1 }) }, 0.25);
    const back = layoutDancer({ person, pose: pose({ amp: 1 }) }, 0.75);
    expect(front.hands.R.p).not.toEqual(back.hands.R.p);
    expect(HAND_HANG_SWING_PX).toBeGreaterThan(0);
  });
});
