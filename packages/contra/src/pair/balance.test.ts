import { HOLD_SPACING_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAIR_FRAME } from "./PairFrame.js";
import { worstShortfall } from "./armShortfall.js";
import { BALANCE_BACK_RATIO, BALANCE_LEAN_CAP, balance, balanceRock } from "./balance.js";
import { REST_FEET } from "./pairPose.js";

const frame = DEFAULT_PAIR_FRAME;
const at = (t: number, params = balance.defaults) => ({
  lark: balance.sample(frame, "lark", t, params),
  robin: balance.sample(frame, "robin", t, params),
});

describe("balance", () => {
  it("is four beats and rocks 1.0 px forward by default", () => {
    expect(balance.beats).toBe(4);
    expect(balance.defaults).toEqual({ rock: 1.0, takeHands: false });
    expect(balance.params).toEqual(["rock", "takeHands"]);
  });

  it("rocks forward, then back, and ends level", () => {
    expect(balanceRock(0)).toBe(0);
    expect(balanceRock(1)).toBe(1);
    expect(balanceRock(3)).toBe(-1);
    expect(balanceRock(4)).toBe(0);
  });

  it("closes the gap by twice the rock and opens it by twice the back rock", () => {
    const together = at(1);
    const apart = at(3);
    expect(dist(together.lark.p, together.robin.p)).toBeCloseTo(HOLD_SPACING_PX - 2, 9);
    expect(dist(apart.lark.p, apart.robin.p)).toBeCloseTo(
      HOLD_SPACING_PX + 2 * BALANCE_BACK_RATIO,
      9,
    );
    expect(dist(at(0).lark.p, at(0).robin.p)).toBeCloseTo(HOLD_SPACING_PX, 9);
    expect(dist(at(4).lark.p, at(4).robin.p)).toBeCloseTo(HOLD_SPACING_PX, 9);
  });

  it("never leans more than the cap, however big the rock is", () => {
    for (let n = 0; n <= 32; n++) {
      const { lark } = at(n / 8, { rock: 4, takeHands: false });
      expect(Math.abs(lark.lean)).toBeLessThanOrEqual(BALANCE_LEAN_CAP);
    }
  });

  it("keeps the joined hands on one shared point the whole way through", () => {
    for (let n = 0; n <= 32; n++) {
      const { lark, robin } = at(n / 8);
      expect(lark.hands.L).toEqual(robin.hands.R);
      expect(lark.hands.R).toEqual(robin.hands.L);
    }
  });

  it("plants the feet and puts them back where the quiet motion would", () => {
    expect(at(0).lark.feet).toEqual(REST_FEET);
    expect(at(4).lark.feet).toEqual(REST_FEET);
    // In the middle the feet stay where they were while the body moves over them.
    const planted = at(1).lark.feet;
    expect(planted?.L[0]).toBeLessThan(REST_FEET.L[0]);
  });

  it("takes hands over the first beat when asked", () => {
    const taking = { rock: 1.0, takeHands: true };
    const start = at(0, taking);
    expect(start.lark.hands.L).not.toEqual(start.robin.hands.R);
    const held = at(1, taking);
    expect(held.lark.hands.L).toEqual(held.robin.hands.R);
  });

  it("never puts a hand out of reach (AC1)", () => {
    expect(worstShortfall(balance, frame).short).toBe(0);
    expect(worstShortfall(balance, frame, { takeHands: true }).short).toBe(0);
    expect(worstShortfall(balance, frame, { rock: 1.3 }).short).toBe(0);
  });
});
