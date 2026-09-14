import { describe, expect, it } from "vitest";
import { angleDiff } from "../geometry/Angle.js";
import type { Hand, PoseSample } from "./PoseSample.js";
import { SEAM_BEATS } from "./RenderingContract.js";
import { easeSeam, seamProgress } from "./easeSeam.js";

const pose = (over: Partial<PoseSample> = {}): PoseSample => ({
  p: [0, 0],
  facing: 0,
  look: 0,
  lean: 0,
  hands: { L: { p: [0, 0], drop: 5 }, R: { p: [0, 0], drop: 5 } },
  stepRate: 1,
  buzz: false,
  flare: 0,
  amp: 1,
  ...over,
});

const prev = pose({
  facing: 350,
  lean: -2,
  hands: { L: { p: [0, 0], drop: 4 }, R: { p: [10, 0], drop: 2 } },
});
const next = pose({
  facing: 10,
  lean: 2,
  stepRate: 2,
  buzz: true,
  hands: { L: { p: [4, 8], drop: 14 }, R: { p: [2, -2], drop: 6 } },
});

describe("easeSeam", () => {
  it("at k = 0 returns prev's hands, facing and lean", () => {
    const s = easeSeam(prev, next, 0);
    expect(s.hands).toEqual(prev.hands);
    expect(s.facing).toBe(prev.facing);
    expect(s.lean).toBe(prev.lean);
  });

  it("at k = 1 returns next's hands, facing and lean", () => {
    const s = easeSeam(prev, next, 1);
    expect(s.hands).toEqual(next.hands);
    expect(angleDiff(s.facing, next.facing)).toBe(0);
    expect(s.lean).toBe(next.lean);
  });

  it("clamps outside [0, 1]", () => {
    expect(easeSeam(prev, next, -5).hands).toEqual(prev.hands);
    expect(easeSeam(prev, next, 5).hands).toEqual(next.hands);
  });

  it("takes everything else from next", () => {
    const s = easeSeam(prev, next, 0.3);
    expect(s.stepRate).toBe(next.stepRate);
    expect(s.buzz).toBe(next.buzz);
    expect(s.p).toBe(next.p);
    expect(s.amp).toBe(next.amp);
  });

  it("takes the shortest arc across the 0/360 wrap", () => {
    const s = easeSeam(prev, next, 0.5);
    // 350 -> 10 is +20 degrees, not -340.
    expect(s.facing).toBeCloseTo(360, 12);
    for (const k of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const f = easeSeam(prev, next, k).facing;
      expect(f).toBeGreaterThanOrEqual(350);
      expect(f).toBeLessThanOrEqual(370);
    }
  });

  it("eases with smoothstep, so it starts and ends flat", () => {
    const at = (k: number) => {
      const h = easeSeam(prev, next, k).hands.L;
      if (h === "down") throw new Error("expected a placed hand");
      return h.p[1];
    };
    // smooth(0.5) = 0.5, so the midpoint is halfway.
    expect(at(0.5)).toBeCloseTo(4, 12);
    // smooth(0.1) = 0.028, much less than a linear 0.1.
    expect(at(0.1)).toBeCloseTo(8 * 0.028, 6);
  });

  it("switches a 'down' hand at the midpoint rather than interpolating", () => {
    const down = pose({ hands: { L: "down", R: "down" } });
    const placed: Hand = { p: [3, 3], drop: 7 };
    const up = pose({ hands: { L: placed, R: placed } });
    expect(easeSeam(down, up, 0.4).hands.L).toBe("down");
    expect(easeSeam(down, up, 0.6).hands.L).toEqual(placed);
  });
});

describe("seamProgress", () => {
  it("spans the first 0.4 beat of a figure", () => {
    expect(SEAM_BEATS).toBe(0.4);
    expect(seamProgress(0)).toBe(0);
    expect(seamProgress(0.2)).toBeCloseTo(0.5, 12);
    expect(seamProgress(0.4)).toBe(1);
    expect(seamProgress(3)).toBe(1);
  });
});
