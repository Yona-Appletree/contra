import {
  ARM_REACH_PX,
  HOLD_SPACING_PX,
  LINE_OFFSET_PX,
  angleDiff,
  dist,
  shouldersAt,
  solveArm,
} from "@caller/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAIR_FRAME,
  HAND_DOWN_DROP_PX,
  handDown,
  pairLinePlace,
  pairPlace,
  partnerOf,
  twoHandHold,
} from "./PairFrame.js";

describe("PairFrame", () => {
  it("stands the pair at the hold spacing, facing each other", () => {
    const lark = pairPlace(DEFAULT_PAIR_FRAME, "lark");
    const robin = pairPlace(DEFAULT_PAIR_FRAME, "robin");
    expect(dist(lark.p, robin.p)).toBeCloseTo(HOLD_SPACING_PX, 9);
    expect(Math.abs(angleDiff(lark.facing, robin.facing))).toBeCloseTo(180, 9);
    // The default frame puts the lark on the left of the screen, as the spike did.
    expect(lark.p[0]).toBeLessThan(robin.p[0]);
  });

  it("puts the lines LINE_OFFSET_PX further apart (AC3)", () => {
    const lark = pairLinePlace(DEFAULT_PAIR_FRAME, "lark");
    const robin = pairLinePlace(DEFAULT_PAIR_FRAME, "robin");
    expect(dist(lark.p, robin.p)).toBeCloseTo(HOLD_SPACING_PX + LINE_OFFSET_PX, 9);
  });

  it("turns with the axis", () => {
    const turned = { ...DEFAULT_PAIR_FRAME, axis: 90 };
    const lark = pairPlace(turned, "lark");
    expect(lark.p[0]).toBeCloseTo(0, 9);
    expect(lark.p[1]).toBeCloseTo(HOLD_SPACING_PX / 2, 9);
    expect(angleDiff(lark.facing, 270)).toBeCloseTo(0, 9);
  });

  it("makes a two-hand hold two shared floor points, not four hands", () => {
    const hold = twoHandHold(DEFAULT_PAIR_FRAME);
    expect(dist(hold.a.p, hold.b.p)).toBeCloseTo(9, 9);
    expect(hold.a.drop).toBe(hold.b.drop);
    // Both points sit across the pair, level with the centre.
    expect(hold.a.p[0]).toBeCloseTo(0, 9);
    expect(hold.b.p[0]).toBeCloseTo(0, 9);
  });

  it("has a partner for each role", () => {
    expect(partnerOf("lark")).toBe("robin");
    expect(partnerOf("robin")).toBe("lark");
  });

  it("hangs a free hand where the arm can always reach it", () => {
    for (let n = 0; n < 16; n++) {
      const beat = n / 8;
      const hand = handDown([0, 0], 30, "L", beat, 1);
      expect(hand.drop).toBe(HAND_DOWN_DROP_PX);
      const sh = shouldersAt([0, 0], 30);
      const solved = solveArm(sh.L, hand, "L", 30);
      expect(solved.short).toBe(0);
      expect(hand.drop).toBeLessThan(ARM_REACH_PX);
    }
  });
});
