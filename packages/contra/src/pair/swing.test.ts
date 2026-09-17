import type { Vec2 } from "@caller/core";
import { angleDiff, dirOf, dist, dot, shouldersAt } from "@caller/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAIR_FRAME, OPEN_PAIR_HALF_PX, norm360 } from "./PairFrame.js";
import { worstShortfall } from "./armShortfall.js";
import { resolveParams } from "./FigureDef.js";
import type { SwingParams } from "./swing.js";
import { handForwardAngle } from "./forwardAngle.js";
import { SWING_BODY_TURN_DEG, swing, swingEndFacing } from "./swing.js";

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

  /**
   * **Gate G1's allemande criterion, which the swing hold now passes too** —
   * the joined arm at least 30° forward of the shoulder line: "The torso should
   * be rotated towards the other person so the arm is angled _forward_ not back.
   * As drawn it would be _very_ uncomfy."
   *
   * It used to fail here, and the failure was written down as geometry rather
   * than tuning: the lark's outstretched arm was 76° forward and the robin's ran
   * 1.3° *behind* her own shoulder line, because the two hands are one shared
   * floor point (AC2) and the line between the two joined shoulders sat 67.6°
   * off each facing. What was not noticed is **why** it sat there: each body was
   * turning `SWING_BODY_TURN_DEG` out of the *axis of the turn* when the 30° is
   * meant to be measured from the *line between the two dancers*, and the
   * ballroom offset puts that line `SWING_HOLD_BEARING_DEG` round from the axis.
   * The two offsets added, the partner ended up 65° round instead of 30°, the
   * pair stood shoulder to shoulder rather than chest to chest — and the robin's
   * joined hand landed behind her own shoulder, where no arm can go.
   *
   * Measured from the line between the bodies, both arms are forward: the lark's
   * 67° and the robin's 34°, and the cone condition the old comment proved
   * impossible — `e · u ≥ |e| / 2` for the line `e` between the joined shoulders
   * and the lark's facing `u` — now holds with room to spare.
   */
  it("holds the joined hands forward of both shoulder lines (gate G1)", () => {
    let larkWorst = Infinity;
    let robinWorst = Infinity;
    for (let n = 8; n <= (swing.beats - 1.4) * 8; n++) {
      const t = n / 8;
      const { lark, robin } = at(t);
      const l = handForwardAngle(lark, "L");
      const r = handForwardAngle(robin, "R");
      if (l !== null) larkWorst = Math.min(larkWorst, l);
      if (r !== null) robinWorst = Math.min(robinWorst, r);
      // The hands on the partner's back and shoulder are forward as well.
      for (const forward of [handForwardAngle(lark, "R"), handForwardAngle(robin, "L")]) {
        if (forward !== null) expect(forward).toBeGreaterThan(30);
      }
    }
    expect(larkWorst).toBeCloseTo(67.0, 0);
    expect(robinWorst).toBeCloseTo(34.0, 0);
    expect(robinWorst).toBeGreaterThan(30);

    // The arithmetic the old comment called impossible: the joined shoulders,
    // and the lark's facing, at the middle of the hold.
    const { lark, robin } = at(4);
    const ls = shouldersAt(lark.p, lark.facing).L;
    const rs = shouldersAt(robin.p, robin.facing).R;
    const e: Vec2 = [rs[0] - ls[0], rs[1] - ls[1]];
    const u = dirOf(lark.facing);
    expect(dot(e, u)).toBeGreaterThan(Math.hypot(e[0], e[1]) / 2);
    expect(SWING_BODY_TURN_DEG).toBe(30);
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
