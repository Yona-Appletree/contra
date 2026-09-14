import { HAND_HANG_SWING_PX, dist, drawnArms } from "@caller/core";
import { describe, expect, it } from "vitest";
import {
  CONTRA_MOTION_BOUNDS,
  CONTRA_TAKE_MOTION,
  GUARD_FACTOR,
  deriveBounds,
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
  });

  it("still comes out at the bounds that are written down", () => {
    expect(derived.bounds.handSpeedPx).toBeCloseTo(CONTRA_MOTION_BOUNDS.handSpeedPx, 3);
    expect(derived.bounds.elbowSpeedPx).toBeCloseTo(CONTRA_MOTION_BOUNDS.elbowSpeedPx, 3);
    expect(derived.bounds.heightRatePx).toBeCloseTo(CONTRA_MOTION_BOUNDS.heightRatePx, 3);
    expect(derived.bounds.dipPx).toBeCloseTo(CONTRA_MOTION_BOUNDS.dipPx, 9);
  });

  it("is a guard at three times the legitimate maximum, not a tuning target", () => {
    expect(GUARD_FACTOR).toBe(3);
    expect(CONTRA_MOTION_BOUNDS.handSpeedPx / CONTRA_TAKE_MOTION.handSpeed).toBeCloseTo(3, 3);
    expect(CONTRA_MOTION_BOUNDS.heightRatePx / CONTRA_TAKE_MOTION.heightRate).toBeCloseTo(3, 3);
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

  it("moves the elbow far faster than the hand, which is why its bound is useless", () => {
    // The finding, asserted so it cannot quietly stop being true: a straight
    // take whips the elbow because a hanging hand is 0.14 px from its own
    // shoulder on the floor, so the elbow's azimuth is very nearly undefined.
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
    expect(derived.take.elbowPerHand).toBeGreaterThan(9);
  });
});
