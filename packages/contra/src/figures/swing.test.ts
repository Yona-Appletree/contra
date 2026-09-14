import { angleDiff, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAIR_FRAME, OPEN_PAIR_HALF_PX, norm360 } from "../pair/PairFrame.js";
import { worstShortfall } from "./armShortfall.js";
import { resolveParams } from "./FigureDef.js";
import type { SwingParams } from "./swing.js";
import { swing, swingEndFacing } from "./swing.js";

const frame = DEFAULT_PAIR_FRAME;
const params = (over: Partial<SwingParams> = {}): SwingParams => resolveParams(swing, over);
const at = (t: number, over: Partial<SwingParams> = {}) => {
  const p = params(over);
  return {
    lark: swing.sample(frame, "lark", t, p),
    robin: swing.sample(frame, "robin", t, p),
  };
};

describe("swing", () => {
  it("is eight beats and two turns by default, and its length is a parameter", () => {
    expect(swing.beats).toBe(8);
    expect(swing.defaults).toEqual({ turns: 2, handOffset: 5, beats: 8, endFacing: null });
    expect(swing.beatsOf?.(params({ beats: 12 }))).toBe(12);
  });

  it("opens out with the lark on the left of the way they face", () => {
    const end = at(8);
    const facing = swingEndFacing(frame, params());
    expect(facing).toBe(270);
    expect(norm360(end.lark.facing)).toBeCloseTo(facing, 6);
    expect(norm360(end.robin.facing)).toBeCloseTo(facing, 6);
    expect(dist(end.lark.p, end.robin.p)).toBeCloseTo(2 * OPEN_PAIR_HALF_PX, 9);
    // The lark is to the left of the facing direction, the robin to the right.
    expect(
      angleDiff(facing, Math.atan2(end.lark.p[1], end.lark.p[0]) * (180 / Math.PI)),
    ).toBeCloseTo(-90, 6);
  });

  it("a half turn more leaves the pair the other way round", () => {
    expect(swingEndFacing(frame, params({ turns: 2.5, beats: 12 }))).toBe(90);
    expect(swingEndFacing({ ...frame, axis: 0 }, params({ turns: 2.5, beats: 12 }))).toBe(270);
  });

  it("holds the outstretched hands on one shared floor point while it turns", () => {
    for (let n = 8; n <= 52; n++) {
      const { lark, robin } = at(n / 8);
      expect(lark.hands.L).toEqual(robin.hands.R);
    }
  });

  it("never joins the hands that are on the partner's back and shoulder", () => {
    for (let n = 8; n <= 52; n++) {
      const { lark, robin } = at(n / 8);
      const a = lark.hands.R;
      const b = robin.hands.L;
      if (a === "down" || b === "down") throw new Error("unreachable");
      expect(dist(a.p, b.p)).toBeGreaterThan(0.1);
    }
  });

  it("handOffset moves the joined hand and both dancers follow it", () => {
    const near = at(4, { handOffset: 5 });
    const far = at(4, { handOffset: 9 });
    const a = near.lark.hands.L;
    const b = far.lark.hands.L;
    if (a === "down" || b === "down") throw new Error("unreachable");
    expect(dist(a.p, b.p)).toBeCloseTo(4, 6);
    expect(far.lark.hands.L).toEqual(far.robin.hands.R);
  });

  it("buzzes: the step rate doubles and the feet are the figure's own", () => {
    const mid = at(4);
    expect(mid.lark.stepRate).toBe(2);
    expect(mid.lark.feet).toBeDefined();
    expect(mid.lark.lean).toBeLessThan(0);
  });

  it("never puts a hand out of reach (AC1)", () => {
    expect(worstShortfall(swing, frame).short).toBe(0);
    expect(worstShortfall(swing, frame, { turns: 2.5, beats: 12 }).short).toBe(0);
    expect(
      worstShortfall({ ...swing }, { ...frame, axis: 0 }, { turns: 2.5, beats: 12 }).short,
    ).toBe(0);
    expect(worstShortfall(swing, frame, { handOffset: 9 }).short).toBe(0);
  });
});
