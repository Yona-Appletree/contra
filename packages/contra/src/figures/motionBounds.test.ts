import { HAND_HANG_SWING_PX, dist, drawnArms } from "@caller/core";
import { describe, expect, it } from "vitest";
import {
  CONTRA_EVENNESS,
  CONTRA_MOTION_BOUNDS,
  CONTRA_TAKE_MOTION,
  CONTRA_TRAVEL_MOTION,
  GUARD_FACTOR,
  TRAVEL_GUARD_FACTOR,
  TRAVEL_REFERENCE_FIGURE,
  deriveBounds,
  floorAspect,
} from "./motionBounds.js";
import { handDown } from "../pair/PairFrame.js";

/**
 * The bounds are derived, not picked, and this is what keeps them honest: it
 * re-runs the derivation and fails if the code has moved under the numbers
 * written down in `motionBounds.ts`.
 *
 * It does **not** re-derive the bounds at runtime. A bound that re-derives
 * itself from the library it is measuring cannot catch the library getting
 * worse, which is the whole job.
 */

const derived = deriveBounds();

describe("the derived motion bounds", () => {
  it("still finds the same worst take in the registry", () => {
    expect(derived.extremes.floorPx).toBeCloseTo(CONTRA_TAKE_MOTION.floorPx, 3);
    expect(derived.extremes.floorAt).toBe(CONTRA_TAKE_MOTION.floorAt);
    expect(derived.extremes.drop).toBeCloseTo(CONTRA_TAKE_MOTION.drop, 3);
    expect(derived.extremes.dropAt).toBe(CONTRA_TAKE_MOTION.dropAt);
  });

  it("still measures the same legitimate maxima for that take", () => {
    expect(derived.take.handSpeed).toBeCloseTo(CONTRA_TAKE_MOTION.handSpeed, 3);
    expect(derived.take.elbowSpeed).toBeCloseTo(CONTRA_TAKE_MOTION.elbowSpeed, 3);
    expect(derived.take.heightRate).toBeCloseTo(CONTRA_TAKE_MOTION.heightRate, 3);
    expect(derived.take.elbowPerHand).toBeCloseTo(CONTRA_TAKE_MOTION.elbowPerHand, 3);
    expect(derived.take.elbowRatio).toBeCloseTo(CONTRA_TAKE_MOTION.elbowRatio, 3);
  });

  it("still comes out at the bounds that are written down", () => {
    expect(derived.bounds.handSpeedPx).toBeCloseTo(CONTRA_MOTION_BOUNDS.handSpeedPx, 3);
    expect(derived.bounds.elbowSpeedPx).toBeCloseTo(CONTRA_MOTION_BOUNDS.elbowSpeedPx, 3);
    expect(derived.bounds.elbowPerHand).toBeCloseTo(CONTRA_MOTION_BOUNDS.elbowPerHand, 3);
    expect(derived.bounds.heightRatePx).toBeCloseTo(CONTRA_MOTION_BOUNDS.heightRatePx, 3);
    expect(derived.bounds.dipPx).toBeCloseTo(CONTRA_MOTION_BOUNDS.dipPx, 9);
    expect(derived.bounds.travelPx).toBeCloseTo(CONTRA_MOTION_BOUNDS.travelPx, 3);
  });

  describe("the sustained-travel bound (M10, R6)", () => {
    it("still measures the swing's own orbit as the legitimate maximum", () => {
      expect(derived.travel.travelPx).toBeCloseTo(CONTRA_TRAVEL_MOTION.travelPx, 3);
      expect(derived.travel.travelAt).toBe(CONTRA_TRAVEL_MOTION.travelAt);
    });

    it("is a guard at one and a half swings, not three takes", () => {
      expect(TRAVEL_GUARD_FACTOR).toBe(1.5);
      // Both written down to four decimals, so the ratio is 1.5 to four too.
      expect(CONTRA_MOTION_BOUNDS.travelPx / CONTRA_TRAVEL_MOTION.travelPx).toBeCloseTo(1.5, 4);
    });

    it("still finds the same fastest figure, which is not the reference", () => {
      // The deviation from M10's plan, kept honest: the plan said to take the
      // fastest figure in the library, and the fastest is `bend-the-line` run
      // alone outside the line of four it is danced in. A guard at 1.5 × that
      // is a guard nothing could trip.
      const fastest = derived.travel.ranking[0]!;
      expect(fastest.id).toBe(CONTRA_TRAVEL_MOTION.fastestId);
      expect(fastest.travelPx).toBeCloseTo(CONTRA_TRAVEL_MOTION.fastestPx, 3);
      expect(fastest.id).not.toBe(TRAVEL_REFERENCE_FIGURE);
    });

    it("ranks exactly these figures above the bound, run alone", () => {
      // A new figure over the bound is a failure; an old one is a named debt.
      const over = derived.travel.ranking
        .filter((row) => row.travelPx > CONTRA_MOTION_BOUNDS.travelPx)
        .map((row) => row.id);
      expect(over).toEqual(["bend-the-line"]);
    });

    it("measures the cruise: the nine switched figures travel no faster than before", () => {
      // The numbers are in `motionBounds.ts`'s own table. `robins-chain` is the
      // one that went up, and deliberately — a constant-rate orbit.
      const by = (id: string): number =>
        derived.travel.ranking.find((row) => row.id === id)?.travelPx ?? Infinity;
      expect(by("star")).toBeLessThan(22.3149);
      expect(by("circle")).toBeLessThan(16.7369);
      expect(by("california-twirl")).toBeLessThan(18.4557);
      expect(by("petronella")).toBeLessThan(14.4224);
      expect(by("pass-through")).toBeLessThan(11.8952);
      expect(by("roll-away")).toBeLessThan(11.8678);
      expect(by("long-lines")).toBeCloseTo(3, 3);
      // M10b took the chain back down: 19.7104 before the opening out became a
      // chord, and 19.1282 after. It is still the figure that went *up* against
      // its pre-cruise 18.3288, which is the constant-rate orbit and is ruled.
      expect(by("robins-chain")).toBeCloseTo(19.1282, 3);
    });
  });

  describe("the evenness bound (M10b)", () => {
    it("is the minor set's own rectangle, measured off the formations", () => {
      // 32 px across the set over 20 px along it, and the same three ways: a
      // bound that moved with the formation would be a bound about nothing.
      expect(floorAspect()).toBeCloseTo(CONTRA_EVENNESS.spread, 9);
      expect(derived.evenness.spread).toBeCloseTo(CONTRA_EVENNESS.spread, 9);
      expect(CONTRA_EVENNESS.acrossPx / CONTRA_EVENNESS.alongPx).toBeCloseTo(
        CONTRA_EVENNESS.spread,
        9,
      );
      expect(CONTRA_MOTION_BOUNDS.spread).toBeCloseTo(CONTRA_EVENNESS.spread, 9);
    });

    it("has no guard factor on top, and the reference is what carries the headroom", () => {
      // Every other bound here is a magnitude times three or times one and a
      // half. This one is a ratio whose ideal is 1, so a multiple of it would
      // be a licence: at GUARD_FACTOR the bound would be 4.8.
      expect(derived.bounds.spread).toBe(derived.evenness.spread);
      // The evidence that the aspect really is the floor's own ceiling: the two
      // figures that walk the rectangle come in just under it.
      const by = (id: string): number =>
        derived.evenness.ranking.find((row) => row.id === id)?.roleSpread ?? Infinity;
      expect(by(CONTRA_EVENNESS.witnessId)).toBeCloseTo(CONTRA_EVENNESS.witnessSpread, 3);
      expect(by(CONTRA_EVENNESS.witnessId)).toBeLessThan(CONTRA_EVENNESS.spread);
      expect(by("petronella")).toBeCloseTo(1.5455, 3);
      expect(by("petronella")).toBeLessThan(CONTRA_EVENNESS.spread);
    });

    it("ranks exactly these figures over the bound, run alone", () => {
      // A new one is a failure; an old one is a named debt. `robins-chain` is
      // M10b's own figure and `bend-the-line` is the same probe artefact its
      // travel row is.
      const roles = derived.evenness.ranking
        .filter((row) => row.roleSpread > CONTRA_MOTION_BOUNDS.spread)
        .map((row) => row.id);
      expect(roles).toEqual(["bend-the-line", "robins-chain"]);
      const halves = derived.evenness.ranking
        .filter((row) => row.partSpread > CONTRA_MOTION_BOUNDS.spread)
        .map((row) => row.id)
        .sort();
      expect(halves).toEqual([
        "balance",
        "bend-the-line",
        "down-the-hall",
        "interrupted-square-through",
        "up-the-hall",
      ]);
    });

    it("leaves a figure nobody moves in out of the ranking rather than calling it even", () => {
      // `turn-alone` turns four dancers on the spot: no body travels, so there
      // is nothing to compare and 0 says so. 1.00 would be a claim.
      const still = derived.evenness.ranking.find((row) => row.id === "turn-alone");
      expect(still?.roleSpread).toBe(0);
      expect(still?.partSpread).toBe(0);
    });
  });

  it("is a guard at three times the legitimate maximum, not a tuning target", () => {
    expect(GUARD_FACTOR).toBe(3);
    expect(CONTRA_MOTION_BOUNDS.handSpeedPx / CONTRA_TAKE_MOTION.handSpeed).toBeCloseTo(3, 3);
    expect(CONTRA_MOTION_BOUNDS.heightRatePx / CONTRA_TAKE_MOTION.heightRate).toBeCloseTo(3, 3);
    expect(CONTRA_MOTION_BOUNDS.elbowSpeedPx / CONTRA_TAKE_MOTION.elbowSpeed).toBeCloseTo(3, 3);
    expect(CONTRA_MOTION_BOUNDS.elbowPerHand / CONTRA_TAKE_MOTION.elbowRatio).toBeCloseTo(3, 3);
  });

  it("derives the dip bound from the only out-and-back the model asks for", () => {
    // A hanging hand swings forward and back once a beat. Nothing else in the
    // resting model reverses, so its full swing is the legitimate maximum.
    let worst = 0;
    let previous: readonly [number, number, number] | undefined;
    let direction: readonly [number, number, number] | undefined;
    let mark: { beat: number; at: readonly [number, number, number] } | undefined;
    for (let i = 0; i <= 256; i++) {
      const t = i / 32;
      const hand = handDown([0, 0], 0, "R", t, 1);
      const here = [hand.p[0], hand.p[1], -hand.drop] as const;
      if (previous) {
        const move = [here[0] - previous[0], here[1] - previous[1], here[2] - previous[2]] as const;
        const length = Math.hypot(move[0], move[1], move[2]);
        if (length > 1e-9) {
          const unit = [move[0] / length, move[1] / length, move[2] / length] as const;
          const reversed =
            direction !== undefined &&
            unit[0] * direction[0] + unit[1] * direction[1] + unit[2] * direction[2] < 0;
          if (reversed) {
            if (mark && t - mark.beat <= 1) {
              worst = Math.max(
                worst,
                Math.hypot(
                  previous[0] - mark.at[0],
                  previous[1] - mark.at[1],
                  previous[2] - mark.at[2],
                ),
              );
            }
            mark = { beat: t, at: previous };
          }
          direction = unit;
        }
      }
      previous = here;
    }
    expect(worst).toBeCloseTo(2 * HAND_HANG_SWING_PX, 9);
    expect(CONTRA_MOTION_BOUNDS.dipPx).toBeCloseTo(GUARD_FACTOR * worst, 9);
  });

  it("no longer whips the elbow, which is what made the old bound useless", () => {
    // A hanging hand really is 0.14 px from its own shoulder on the floor, so
    // the elbow's azimuth really is nearly undefined there — but that is not
    // what made F3a's take move the elbow at 250 px/beat. That was the pole
    // lining up with the arm part way through, and the elbow flipping through
    // 180°; with `ELBOW_POLE_ALONG_FRACTION` capping it the same take moves the
    // elbow at 68 px/beat, 2.54× the hand rather than 9.33×.
    const hip = handDown([0, 0], 0, "R", 0, 0);
    const arms = drawnArms(
      {
        p: [0, 0],
        facing: 0,
        look: 0,
        lean: 0,
        hands: { L: "down", R: hip },
        stepRate: 1,
        buzz: false,
        flare: 0,
        amp: 0,
      },
      0,
    );
    expect(dist(hip.p, arms.shoulders.R)).toBeLessThan(0.2);
    expect(derived.take.elbowPerHand).toBeLessThan(3);
    expect(derived.take.elbowRatio).toBeLessThan(4);
  });
});
