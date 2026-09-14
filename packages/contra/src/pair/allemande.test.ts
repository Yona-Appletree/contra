import { HOLD_SPACING_PX, angleDiff, angleOf, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { CENTRE_DROP_PX, DEFAULT_PAIR_FRAME, norm360 } from "./PairFrame.js";
import { worstShortfall } from "./armShortfall.js";
import { resolveParams } from "./FigureDef.js";
import type { AllemandeParams } from "./allemande.js";
import { allemande } from "./allemande.js";

const frame = DEFAULT_PAIR_FRAME;
const at = (t: number, over: Partial<AllemandeParams> = {}) => {
  const p = resolveParams(allemande, over);
  return {
    lark: allemande.sample(frame, "lark", t, p),
    robin: allemande.sample(frame, "robin", t, p),
  };
};

describe("allemande", () => {
  it("is eight beats, left hand, once round, 20 degrees in", () => {
    expect(allemande.beats).toBe(8);
    expect(allemande.defaults).toEqual({
      hand: "L",
      amount: 1,
      inward: 20,
      startFacing: null,
    });
  });

  it("gives one hand at the pair's centre, as one shared point", () => {
    for (let n = 11; n <= 55; n++) {
      const { lark, robin } = at(n / 8);
      expect(lark.hands.L).toEqual(robin.hands.L);
      const h = lark.hands.L;
      if (h === "down") throw new Error("unreachable");
      expect(h.p).toEqual(frame.centre);
      expect(h.drop).toBe(CENTRE_DROP_PX);
    }
  });

  it("leaves the free hands well apart", () => {
    for (let n = 11; n <= 55; n++) {
      const { lark, robin } = at(n / 8);
      const a = lark.hands.R;
      const b = robin.hands.R;
      if (a === "down" || b === "down") throw new Error("unreachable");
      expect(dist(a.p, b.p)).toBeGreaterThan(1);
    }
  });

  it("turns each body `inward` degrees toward the centre, on top of the walk", () => {
    const spin = -1; // left hand
    for (const inward of [0, 20, 35]) {
      const { lark } = at(4, { inward });
      const onCircle = angleOf(lark.p[0] - frame.centre[0], lark.p[1] - frame.centre[1]);
      // Walking the circle alone would face `onCircle + spin * 90`.
      const walking = onCircle + spin * 90;
      expect(angleDiff(walking, lark.facing)).toBeCloseTo(spin * inward, 4);
    }
  });

  it("once round comes back to the same side, once and a half swaps sides", () => {
    const once = at(8, { amount: 1 });
    expect(dist(once.lark.p, once.robin.p)).toBeCloseTo(HOLD_SPACING_PX, 9);
    expect(norm360(angleOf(once.lark.p[0], once.lark.p[1]))).toBeCloseTo(180, 6);

    const half = at(8, { amount: 1.5 });
    expect(norm360(angleOf(half.lark.p[0], half.lark.p[1]))).toBeCloseTo(0, 6);
  });

  it("a right allemande turns the other way", () => {
    const left = at(4, { hand: "L" });
    const right = at(4, { hand: "R" });
    expect(angleOf(left.lark.p[0], left.lark.p[1])).not.toBeCloseTo(
      angleOf(right.lark.p[0], right.lark.p[1]),
      3,
    );
    expect(right.lark.hands.R).toEqual(right.robin.hands.R);
  });

  it("never puts a hand out of reach (AC1)", () => {
    for (const amount of [1, 1.5, 2]) {
      for (const hand of ["L", "R"] as const) {
        expect(worstShortfall(allemande, frame, { amount, hand }).short).toBe(0);
      }
    }
  });
});
