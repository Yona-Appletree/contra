import type { Vec2 } from "@caller/core";
import { SHOULDER_WIDTH_PX, dirOf, rightOf } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { DancerLayout } from "../person/layoutDancer.js";
import { layoutDancer } from "../person/layoutDancer.js";
import { createPerson } from "../person/Person.js";
import type { HallPerson } from "../world/layoutHall.js";
import { posture } from "./drawFurniture.js";

const person = createPerson({ id: "s", role: "other", seed: 3, skirt: false });

const sitter = (taps: boolean): HallPerson => ({
  person,
  p: [3, -4],
  facing: 37,
  seated: true,
  taps,
});

function local(q: Vec2, layout: DancerLayout): Vec2 {
  const d = dirOf(layout.torsoAngle);
  const r = rightOf(layout.torsoAngle);
  const dx = q[0] - layout.p[0];
  const dy = q[1] - layout.p[1];
  return [dx * d[0] + dy * d[1], dx * r[0] + dy * r[1]];
}

/**
 * Gate G1's resting-arm ruling reaches M4's sitters too: somebody sitting out
 * a dance is not holding their arms away from their body either. Before this
 * milestone a sitter measured 17.5 px across the elbows against 11 px of
 * shoulder — wider than a dancer in a two-hand hold.
 */
describe("a sitter's arms", () => {
  it("tuck in rather than winging out", () => {
    for (const taps of [false, true]) {
      for (const beat of [0, 0.25, 0.5, 0.75]) {
        const who = sitter(taps);
        const layout = layoutDancer({ person, pose: posture(who, beat) }, beat);
        let half = SHOULDER_WIDTH_PX / 2;
        for (const arm of layout.arms) {
          for (const q of [arm.elbow, arm.hand]) {
            half = Math.max(half, Math.abs(local(q, layout)[1]));
          }
          expect(arm.short, `short, taps ${String(taps)}, beat ${beat}`).toBe(0);
        }
        // Shoulders, plus at most 1.5 px of arm each side.
        expect(half * 2, `sitter width, taps ${String(taps)}, beat ${beat}`).toBeLessThanOrEqual(
          SHOULDER_WIDTH_PX + 3,
        );
      }
    }
  });

  it("rests both hands forward, on the knees, at the same height", () => {
    const layout = layoutDancer({ person, pose: posture(sitter(false), 0) }, 0);
    const [lf, lr] = local(layout.hands.L.p, layout);
    const [rf, rr] = local(layout.hands.R.p, layout);
    expect(lf).toBeCloseTo(rf, 9);
    expect(lf).toBeGreaterThan(0);
    expect(lr).toBeCloseTo(-rr, 9);
    expect(layout.hands.L.drop).toBe(layout.hands.R.drop);
  });
});
