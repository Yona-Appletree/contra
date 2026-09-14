import type { Beat, Hand, Side, Vec2 } from "@caller/core";
import { HAND_HANG_DROP_PX, HAND_HANG_SWING_PX, dist, drawnArms } from "@caller/core";
import type { MotionBounds } from "@caller/choreo";
import { frame as makeFrame, withDefaults } from "@caller/choreo";
import type { ContraFigure, ContraParams, Spot } from "./ContraFigure.js";
import { holdWindow, takeAndRelease } from "./ContraFigure.js";
import { CONTRA_FIGURES, CONTRA_FIGURE_IDS } from "./registry.js";
import { probeGroup } from "./testing.js";
import { handDown } from "../pair/PairFrame.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";

/**
 * How fast a drawn arm is *allowed* to move, derived rather than picked.
 *
 * The fastest legitimate hand motion this library contains is a take: a hand
 * leaves the dancer's hip and arrives at a joined point, over one beat, with
 * `takeAndRelease`'s own ramp. Everything else — a swing's orbit, a hey's
 * lane, a chain's pull by — moves a hand at the speed a body walks, which is
 * far slower. So the legitimate maximum is that take at its worst geometry,
 * and the bound is a **guard at three times it**, not a tuning target. A bound
 * at 1.05× would flake on the first figure anyone re-tuned.
 *
 * Every number here is measured by {@link deriveTakeMotion} at 1/32 beat, and
 * `motionBounds.test.ts` re-derives them and fails if the code has moved.
 */

/** How finely the derivation samples, matching the oracle's own step. */
export const DERIVE_STEP: Beat = 1 / 32;

/** The factor between the legitimate maximum and the guard. */
export const GUARD_FACTOR = 3;

/** What one take actually does, measured. */
export interface TakeMotion {
  /** How far the hand travels on the floor, px. */
  floorPx: number;
  /** How far the hand's height changes, px. */
  dropPx: number;
  /** Peak floor speed of the hand, px per beat. */
  handSpeed: number;
  /** Peak floor speed of the elbow, px per beat. */
  elbowSpeed: number;
  /** Peak rate of change of the hand's height, px per beat. */
  heightRate: number;
  /** `elbowSpeed / handSpeed`: what a straight take does to the elbow. */
  elbowPerHand: number;
}

/** The furthest and the lowest a figure in the registry ever places a hand. */
export interface TakeExtremes {
  /** The largest floor distance from a dancer's own hip to a hand they hold. */
  floorPx: number;
  /** Where that was. */
  floorAt: string;
  /** The smallest drop a figure ever holds a hand at, so the largest lift. */
  drop: number;
  /** Where that was. */
  dropAt: string;
}

/**
 * The furthest a figure in the registry ever reaches for a joined point, and
 * the highest it ever lifts one, each run alone in a duple improper group.
 */
export function takeExtremes(step: Beat = DERIVE_STEP): TakeExtremes {
  const group = probeGroup(DUPLE_IMPROPER, 4, DUPLE_IMPROPER_FRAME);
  const found: TakeExtremes = { floorPx: 0, floorAt: "", drop: Infinity, dropAt: "" };
  for (const id of CONTRA_FIGURE_IDS) {
    const def = CONTRA_FIGURES[id] as unknown as ContraFigure<ContraParams>;
    const params = withDefaults(def, {}, def.beats);
    const steps = Math.round(def.beats / step);
    for (const station of group.stations) {
      for (let i = 0; i <= steps; i++) {
        const t = i * step;
        const pose = def.sample(group, station.id, t, params);
        for (const side of SIDES) {
          const hand = pose.hands[side];
          if (hand === "down" || !Number.isFinite(hand.p[0]) || !Number.isFinite(hand.drop)) {
            continue;
          }
          const hip = handDown(pose.p, pose.facing, side, t, pose.amp);
          const gap = dist(hand.p, hip.p);
          const where = `${id} ${station.id} ${side} at t=${t.toFixed(3)}`;
          if (gap > found.floorPx) {
            found.floorPx = gap;
            found.floorAt = where;
          }
          if (hand.drop < found.drop) {
            found.drop = hand.drop;
            found.dropAt = where;
          }
        }
      }
    }
  }
  return found;
}

/**
 * One `takeAndRelease` take, measured: a dancer standing still lifts one hand
 * from their hip to a joined point `floorPx` away and `drop` px below the
 * shoulder, over a one-beat `holdWindow` take.
 *
 * The dancer stands still deliberately: the number wanted is the take's own
 * speed, not the take plus a walk, and every figure that walks while it takes
 * adds its own walking speed on top of this.
 */
export function deriveTakeMotion(floorPx: number, drop: number, step = DERIVE_STEP): TakeMotion {
  const self: Spot = { p: [0, 0], facing: 0 };
  const hip = handDown(self.p, self.facing, "R", 0, 0);
  // Straight out to the dancer's own right, so the whole of the distance is
  // travel rather than a diagonal that partly cancels.
  const joined: Hand = { p: [hip.p[0], hip.p[1] + floorPx], drop };
  const window = holdWindow(8, 1, 1);

  let handSpeed = 0;
  let elbowSpeed = 0;
  let heightRate = 0;
  let previous: { hand: Hand; elbow: Vec2 } | undefined;
  const steps = Math.round(2 / step);
  for (let i = 0; i <= steps; i++) {
    const t = i * step;
    const hand = takeAndRelease(self, "R", t, joined, window, 0);
    const arms = drawnArms(
      {
        p: self.p,
        facing: self.facing,
        look: self.facing,
        lean: 0,
        hands: { L: "down", R: hand },
        stepRate: 1,
        buzz: false,
        flare: 0,
        amp: 0,
      },
      t,
    );
    const elbow = arms.arms[1]!.elbow;
    if (previous) {
      handSpeed = Math.max(handSpeed, dist(hand.p, previous.hand.p) / step);
      elbowSpeed = Math.max(elbowSpeed, dist(elbow, previous.elbow) / step);
      heightRate = Math.max(heightRate, Math.abs(hand.drop - previous.hand.drop) / step);
    }
    previous = { hand, elbow };
  }
  return {
    floorPx,
    dropPx: HAND_HANG_DROP_PX - drop,
    handSpeed,
    elbowSpeed,
    heightRate,
    elbowPerHand: elbowSpeed / handSpeed,
  };
}

/**
 * The take the bounds are derived from: the registry's own worst geometry.
 *
 * The furthest a figure reaches for a joined point and the highest it lifts
 * one do not happen in the same figure, so the derivation takes the worst of
 * each. That is deliberately pessimistic — a bound has to cover both.
 */
export function deriveBounds(step = DERIVE_STEP): {
  extremes: TakeExtremes;
  take: TakeMotion;
  bounds: MotionBounds;
} {
  const extremes = takeExtremes(step);
  const take = deriveTakeMotion(extremes.floorPx, extremes.drop, step);
  return {
    extremes,
    take,
    bounds: {
      handSpeedPx: GUARD_FACTOR * take.handSpeed,
      elbowSpeedPx: GUARD_FACTOR * take.handSpeed * take.elbowPerHand,
      heightRatePx: GUARD_FACTOR * take.heightRate,
      // A hanging hand swings forward and back once a beat: an out-and-back of
      // exactly `2 × HAND_HANG_SWING_PX`, and the only one the model asks for.
      dipPx: GUARD_FACTOR * 2 * HAND_HANG_SWING_PX,
    },
  };
}

/**
 * The bounds, as derived on 2026-09-14 and written down so the oracle is not
 * re-deriving itself out of its own defects.
 *
 * `motionBounds.test.ts` re-runs {@link deriveBounds} and fails if any of these
 * has moved, so the numbers stay honest without the oracle chasing the code.
 *
 * | | legitimate maximum | × 3 = the bound |
 * | --- | ---: | ---: |
 * | hand floor speed | 26.8129 px/beat | 80.4388 |
 * | elbow floor speed | 250.2552 px/beat | 750.7657 |
 * | hand height rate | 21.7217 px/beat | 65.1650 |
 * | out-and-back inside a beat | 1.2 px | 3.6 |
 *
 * **The elbow bound is useless, and that is the finding, not an accident.** A
 * straight take moves the elbow at **9.33×** the hand's speed, because the arm
 * starts nearly vertical — a hanging hand is 0.14 px from its own shoulder on
 * the floor — so the elbow's azimuth is very nearly undefined and the smallest
 * movement of the hand swings it a long way. Three times that is 750 px/beat,
 * which nothing will ever trip. Read the report's elbow column against its
 * hand column instead: `long-lines` moves an elbow at 334 px/beat while its
 * hand does 21, and `california-twirl` at 314 against 28. Whether the elbow
 * should be bounded some other way is a ruling for the director.
 */
export const CONTRA_MOTION_BOUNDS: MotionBounds = {
  handSpeedPx: 80.4388,
  elbowSpeedPx: 750.7657,
  heightRatePx: 65.165,
  dipPx: 3.6,
};

/** The measured legitimate maxima the bounds above are three times. */
export const CONTRA_TAKE_MOTION = {
  /** The furthest hip-to-joined-point reach in the registry, px. */
  floorPx: 17.8986,
  floorAt: "right-and-left-through 1L L at t=5.750",
  /** The smallest drop any figure holds a hand at, px. */
  drop: 0,
  dropAt: "swing 1R L at t=1.000",
  handSpeed: 26.8129,
  elbowSpeed: 250.2552,
  heightRate: 21.7217,
  elbowPerHand: 9.3334,
  hangingDipPx: 2 * HAND_HANG_SWING_PX,
} as const;

const SIDES: readonly Side[] = ["L", "R"];

/** The frame the derivation probes on: the set down the hall, on the origin. */
const DUPLE_IMPROPER_FRAME = makeFrame([0, 0], 90);
