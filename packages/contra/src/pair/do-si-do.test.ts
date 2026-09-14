import { HOLD_SPACING_PX, angleDiff, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAIR_FRAME, pairPlace } from "./PairFrame.js";
import { worstShortfall } from "./armShortfall.js";
import { doSiDo } from "./do-si-do.js";

const frame = DEFAULT_PAIR_FRAME;
const at = (t: number) => ({
  lark: doSiDo.sample(frame, "lark", t, {}),
  robin: doSiDo.sample(frame, "robin", t, {}),
});

describe("doSiDo", () => {
  it("is eight beats with no parameters", () => {
    expect(doSiDo.beats).toBe(8);
    expect(doSiDo.id).toBe("do-si-do");
    expect(doSiDo.params).toEqual([]);
  });

  it("keeps both bodies facing where they started", () => {
    const lark = pairPlace(frame, "lark").facing;
    const robin = pairPlace(frame, "robin").facing;
    for (let n = 0; n <= 64; n++) {
      const pose = at(n / 8);
      expect(angleDiff(pose.lark.facing, lark)).toBeCloseTo(0, 9);
      expect(angleDiff(pose.robin.facing, robin)).toBeCloseTo(0, 9);
    }
  });

  it("goes round and comes back to where it started", () => {
    const start = at(0);
    const end = at(8);
    expect(dist(start.lark.p, end.lark.p)).toBeLessThan(1e-9);
    expect(dist(start.robin.p, end.robin.p)).toBeLessThan(1e-9);
    // Back to back half way round, a little further apart than the hold.
    const half = at(4);
    expect(dist(half.lark.p, half.robin.p)).toBeGreaterThan(HOLD_SPACING_PX);
  });

  it("turns the head to keep the partner in sight", () => {
    const quarter = at(2);
    expect(Math.abs(angleDiff(quarter.lark.facing, quarter.lark.look))).toBeGreaterThan(20);
  });

  it("never joins hands", () => {
    for (let n = 0; n <= 64; n++) {
      const { lark, robin } = at(n / 8);
      for (const a of [lark.hands.L, lark.hands.R]) {
        for (const b of [robin.hands.L, robin.hands.R]) {
          if (a === "down" || b === "down") throw new Error("unreachable");
          expect(dist(a.p, b.p)).toBeGreaterThan(0.1);
        }
      }
    }
  });

  it("never puts a hand out of reach (AC1)", () => {
    expect(worstShortfall(doSiDo, frame).short).toBe(0);
  });
});
