import { HOLD_SPACING_PX, angleDiff, angleOf, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { CENTRE_DROP_PX, DEFAULT_PAIR_FRAME, norm360 } from "./PairFrame.js";
import { worstShortfall } from "./armShortfall.js";
import { handForwardAngle } from "./forwardAngle.js";
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
  it("is eight beats, left hand, once round, 45 degrees in", () => {
    expect(allemande.beats).toBe(8);
    expect(allemande.defaults).toEqual({
      hand: "L",
      amount: 1,
      inward: 45,
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

  /**
   * Gate G1: "The allemande is way off still. The torso should be rotated
   * towards the other person so the arm is angled _forward_ not back. As drawn
   * it would be _very_ uncomfy. We rotate our torsos a decent amount towards
   * the other person."
   *
   * The joined hand has to stay forward of the shoulder line by at least 30°
   * for the whole of the turn — from the moment the hand is taken (the take
   * ends at beat 1.3) to the moment it is let go (the release starts at
   * `beats − 0.9`). Outside that window the hand is not joined: it is the
   * inside hand a swing left behind the pair, or a hand already hanging.
   */
  it("keeps the joined arm forward of the shoulder line all the way round", () => {
    for (const amount of [1, 1.5, 2]) {
      for (const hand of ["L", "R"] as const) {
        const p = resolveParams(allemande, { amount, hand });
        for (let n = Math.ceil(1.3 * 8); n <= (allemande.beats - 0.9) * 8; n++) {
          const t = n / 8;
          for (const role of ["lark", "robin"] as const) {
            const forward = handForwardAngle(allemande.sample(frame, role, t, p), hand);
            expect(forward, `${role} ${hand} at t=${t}`).not.toBeNull();
            expect(forward ?? 0, `${role} ${hand} at t=${t}`).toBeGreaterThanOrEqual(30);
          }
        }
      }
    }
  });

  it("turns the torso a decent amount toward the partner, and 20 degrees was not enough", () => {
    const worst = (inward: number): number => {
      let least = Infinity;
      const p = resolveParams(allemande, { inward });
      for (let n = Math.ceil(1.3 * 8); n <= (allemande.beats - 0.9) * 8; n++) {
        for (const role of ["lark", "robin"] as const) {
          const forward = handForwardAngle(allemande.sample(frame, role, n / 8, p), "L");
          if (forward !== null) least = Math.min(least, forward);
        }
      }
      return least;
    };
    // The old 20° default already cleared the 30° bar measured from the
    // shoulder (43.2°), which is why it needed an eye rather than a number to
    // catch: measured from the body centre — the line the eye actually reads
    // at this scale — 20° of torso turn leaves the arm 20° forward of the
    // shoulder line and 45° leaves it 45°. The new default has 70° of margin
    // on the shoulder measure rather than 13°.
    expect(worst(20)).toBeCloseTo(43.2, 1);
    expect(worst(45)).toBeGreaterThan(worst(20));
    expect(worst(45)).toBeGreaterThanOrEqual(70);
  });
});
