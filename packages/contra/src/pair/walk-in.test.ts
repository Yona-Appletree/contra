import { HOLD_SPACING_PX, LINE_OFFSET_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAIR_FRAME, twoHandHold } from "./PairFrame.js";
import { worstShortfall } from "./armShortfall.js";
import { walkIn } from "./walk-in.js";

const frame = DEFAULT_PAIR_FRAME;
const at = (t: number) => ({
  lark: walkIn.sample(frame, "lark", t, {}),
  robin: walkIn.sample(frame, "robin", t, {}),
});

describe("walkIn", () => {
  it("is four beats with no parameters", () => {
    expect(walkIn.beats).toBe(4);
    expect(walkIn.params).toEqual([]);
    expect(walkIn.id).toBe("walk-in");
  });

  it("starts in the lines and ends at the hold spacing", () => {
    const start = at(0);
    const end = at(4);
    expect(dist(start.lark.p, start.robin.p)).toBeCloseTo(HOLD_SPACING_PX + LINE_OFFSET_PX, 9);
    expect(dist(end.lark.p, end.robin.p)).toBeCloseTo(HOLD_SPACING_PX, 9);
  });

  it("faces the partner throughout", () => {
    for (let n = 0; n <= 32; n++) {
      const { lark, robin } = at(n / 8);
      expect(Math.abs(lark.facing - 0)).toBeLessThan(1e-9);
      expect(Math.abs(robin.facing - 180)).toBeLessThan(1e-9);
    }
  });

  it("animates the take rather than snapping it", () => {
    const hold = twoHandHold(frame);
    // Still at the dancer's side when the walk finishes.
    const arrived = at(2).lark.hands.L;
    expect(arrived).not.toBe("down");
    if (arrived === "down") throw new Error("unreachable");
    expect(dist(arrived.p, hold.a.p)).toBeGreaterThan(3);
    // Half way up at the middle of the take.
    const middle = at(2.6).lark.hands.L;
    if (middle === "down") throw new Error("unreachable");
    expect(dist(middle.p, hold.a.p)).toBeLessThan(dist(arrived.p, hold.a.p));
    expect(dist(middle.p, hold.a.p)).toBeGreaterThan(0.1);
  });

  it("ends with the joined hands on one shared floor point", () => {
    const hold = twoHandHold(frame);
    for (const t of [3.2, 3.6, 4]) {
      const { lark, robin } = at(t);
      expect(lark.hands.L).toEqual(hold.a);
      expect(robin.hands.R).toEqual(hold.a);
      expect(lark.hands.R).toEqual(hold.b);
      expect(robin.hands.L).toEqual(hold.b);
    }
  });

  it("never puts a hand out of reach (AC1)", () => {
    expect(worstShortfall(walkIn, frame).short).toBe(0);
  });
});
