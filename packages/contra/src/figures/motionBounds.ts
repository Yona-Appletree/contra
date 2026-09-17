import type { Beat, Hand, Side, Vec2 } from "@caller/core";
import { HAND_HANG_DROP_PX, HAND_HANG_SWING_PX, dist, drawnArms, handDown } from "@caller/core";
import { DATA_DEFINITIONS } from "../library/figures/index.js";
import { figureOnFour } from "./onFour.js";

import type { MotionBounds } from "@caller/choreo";
import { STILL_BODY_PX, STILL_HAND_PX, frame as makeFrame, withDefaults } from "@caller/choreo";
import type { ContraFigure, ContraParams, Spot } from "./ContraFigure.js";
import { holdWindow, takeAndRelease } from "./ContraFigure.js";

import { probeGroup } from "./testing.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { PROPER } from "../formation/proper.js";
import { BECKET } from "../formation/becket.js";

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

/**
 * The guard factor for **sustained travel** (R6, director debt 8), and it is
 * `1.5` rather than the takes' `3` on purpose.
 *
 * A take is a hand leaving a hip and arriving somewhere inside a beat, and
 * three times the worst honest one is still obviously a take. Travel is not
 * like that: the legitimate maximum is the fastest a *body* legitimately moves
 * for a whole beat, which is the swing's own orbit, and three times a swing is
 * not a fast walk but a sprint. One and a half is the judgement — a walk faster
 * than one and a half swings is a run — and G1's fourth question is whether it
 * is the right one.
 */
export const TRAVEL_GUARD_FACTOR = 1.5;

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
  /** `elbowSpeed / handSpeed`: what a straight take does to the elbow, peak against peak. */
  elbowPerHand: number;
  /**
   * The worst **per-sample** ratio of elbow speed to hand speed in that take,
   * with the hand floored at {@link STILL_HAND_PX}.
   *
   * This is the number the oracle's own `elbowPerHand` column is measured
   * against, and it is not the same as the one above: the two peaks need not
   * fall on the same sample.
   */
  elbowRatio: number;
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
  for (const id of travelFigureIds()) {
    const def = travelFigureOf(id);
    if (def === undefined) continue;
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

/** One figure's own worst sustained travel, run alone at its nominal count. */
export interface TravelRow {
  id: string;
  /** Peak body speed averaged over a one-beat window, px per beat. */
  travelPx: number;
  /** Which figure-role, and at which beat the window ended. */
  at: string;
}

/** The travel derivation: the reference figure, and every figure ranked against it. */
export interface TravelMotion {
  /**
   * The legitimate maximum: **the swing's own orbit**, px per beat over a
   * one-beat window. See {@link deriveTravel} for why the swing and not the
   * fastest row in the ranking.
   */
  travelPx: number;
  /** Which figure-role of the swing, and at which beat. */
  travelAt: string;
  /** Every figure that can be run alone, worst first. */
  ranking: readonly TravelRow[];
}

/** The figure the travel bound is measured on; see {@link deriveTravel}. */
export const TRAVEL_REFERENCE_FIGURE = "swing";

/**
 * **How fast a body may legitimately travel, sustained** (R6, director debt 8).
 *
 * The reference is **the swing's orbit**, measured rather than typed: a buzz-step
 * swing is the fastest thing in contra that everybody agrees is danced rather
 * than run, and a walk faster than one and a half of it
 * ({@link TRAVEL_GUARD_FACTOR}) is a run. The whole library is measured beside
 * it and the ranking is returned, so that a figure above the reference is a
 * named fact rather than a silent one.
 *
 * **This is a deviation from M10's plan, and a deliberate one.** The plan said
 * to take the *fastest* sustained travel any definition makes at its nominal
 * count and expected that to be the swing at about 12.86 px/beat. Measured
 * against the library as it merged, it is not: `bend-the-line` reaches
 * 28.9 px/beat run alone in a duple improper group of four, which is not a line
 * of four and therefore not the formation the figure is danced in — and a guard
 * at 1.5 × 28.9 = 43 px/beat is a guard nothing in the library could ever trip,
 * which is exactly the advisory column R6 asked to replace. So the reference is
 * the figure the plan's own parenthesis named, and the handful of figures above
 * it are allowlisted by name with what is known about each.
 *
 * Each figure is run alone at its nominal count in a duple improper group of
 * four — the same probe {@link takeExtremes} uses — through the registry, so a
 * figure that still has a coded twin is measured on the twin (DD21 pins the two
 * together to 0.01 px) and a data-only figure on its definition. A definition
 * whose anchor wants the two dancers resolution hands it, rather than a whole
 * minor set, cannot be run alone at all and is simply not in the ranking.
 */
export function deriveTravel(step: Beat = DERIVE_STEP): TravelMotion {
  const group = probeGroup(DUPLE_IMPROPER, 4, DUPLE_IMPROPER_FRAME);
  const window = Math.max(1, Math.round(1 / step));
  const ranking: TravelRow[] = [];

  for (const id of travelFigureIds()) {
    const def = travelFigureOf(id);
    if (def === undefined) continue;
    const params = withDefaults(def, {}, def.beats);
    const steps = Math.round(def.beats / step);
    let best = 0;
    let at = "";
    let plannable = true;
    for (const station of group.stations) {
      const along: number[] = [0];
      let previous: Vec2 | undefined;
      for (let i = 0; i <= steps; i++) {
        const t = i * step;
        let p: Vec2;
        try {
          p = def.sample(group, station.id, t, params).p;
        } catch {
          plannable = false;
          break;
        }
        if (previous !== undefined) along.push(along[along.length - 1]! + dist(previous, p));
        previous = p;
      }
      if (!plannable) break;
      for (let i = window; i < along.length; i++) {
        const travelled = along[i]! - along[i - window]!;
        if (travelled <= best) continue;
        best = travelled;
        at = `${station.id} to t=${(i * step).toFixed(3)}`;
      }
    }
    if (plannable) ranking.push({ id, travelPx: best, at });
  }

  ranking.sort((a, b) => b.travelPx - a.travelPx || a.id.localeCompare(b.id));
  const reference = ranking.find((row) => row.id === TRAVEL_REFERENCE_FIGURE);
  if (reference === undefined) {
    throw new Error(`the travel bound's reference figure "${TRAVEL_REFERENCE_FIGURE}" is missing`);
  }
  return {
    travelPx: reference.travelPx,
    travelAt: `${TRAVEL_REFERENCE_FIGURE} ${reference.at}`,
    ranking,
  };
}

/** Every figure the travel derivation ranks: the library's, in its own order. */
function travelFigureIds(): readonly string[] {
  return DATA_DEFINITIONS.map((def) => def.id);
}

/**
 * The figure behind an id: the definition, planned over a hands-four.
 *
 * Before M11 this fell back to the **coded twin** for the swing and its kind,
 * whose `meet` anchor a four-station context refuses by name. `figureOnFour`
 * is what answers for them now — it mints the pair instances a hands-four
 * implies — and a figure that needs more of the set than a minor set holds has
 * no figure-alone row and is measured in a dance instead.
 */
function travelFigureOf(id: string): ContraFigure<ContraParams> | undefined {
  const figure = figureOnFour(id);
  return figure !== undefined && plansAlone(figure) ? figure : undefined;
}

/** Whether a figure can be planned over a whole minor set standing alone. */
function plansAlone(def: ContraFigure<ContraParams>): boolean {
  try {
    const group = probeGroup(DUPLE_IMPROPER, 4, DUPLE_IMPROPER_FRAME);
    def.sample(group, group.stations[0]!.id, 0, withDefaults(def, {}, def.beats));
    return true;
  } catch {
    return false;
  }
}

/** One figure's own worst evenness, run alone at its nominal count. */
export interface EvennessRow {
  id: string;
  /** The fastest role's mean speed over the slowest's; `0` where nobody moved. */
  roleSpread: number;
  /** The worst dancer's faster half over their slower half; `0` where nobody moved. */
  partSpread: number;
  /** Which role was fastest, and whose halves were worst. */
  at: string;
}

/** The evenness derivation: the floor's own aspect, and every figure ranked against it. */
export interface EvennessMotion {
  /** The bound itself: the aspect of the minor set's own rectangle. */
  spread: number;
  /** How that number was arrived at, in words a table can carry. */
  spreadAt: string;
  /** Every figure that can be run alone, worst role spread first. */
  ranking: readonly EvennessRow[];
}

/**
 * **How far apart one figure's speeds may be** (M10b): the aspect of the floor
 * it is danced on.
 *
 * The user, judging M10's chain: *"people try to move at a constant speed
 * throughout the moves for the most part."* So the ideal of both spread columns
 * is **1.0**, and the only question a bound has to answer is how far from it a
 * figure is entitled to be.
 *
 * The answer is the floor. Four dancers stand on the four places of a minor
 * set, and that is a **rectangle and not a square**: `ACROSS_PX` = 32 px across
 * the set against `PLACE_PITCH_PX` = 20 px along it, in every formation this
 * library dances — duple improper, proper and becket all measure the same
 * 32 × 20. A figure that sends its roles round those places therefore *must*
 * send some of them further than others, in the ratio of the rectangle's two
 * sides, and `petronella` — which is exactly that figure, every dancer moving
 * one place clockwise round the ring — measures **1.5455**, with
 * `single-file-promenade`, which walks the whole rectangle, at **1.5960**. Both
 * sit just under the aspect, which is the evidence that the aspect is the
 * ceiling the floor imposes rather than a number picked to sit above them.
 *
 * **There is no guard factor on top, and that is deliberate.** Every other
 * bound in this file multiplies a *magnitude* — a speed, a distance — by three
 * or by one and a half, because the honest maximum of a magnitude is a typical
 * case and a guard has to clear it. This one is a **ratio whose ideal is 1**,
 * and a multiple of it would be a licence rather than a guard: at
 * {@link GUARD_FACTOR} the bound would be 4.8, which permits a figure to walk
 * one role nearly five times as fast as another. The headroom is in the
 * reference instead — the aspect is the *worst* the floor can do to a figure,
 * not a typical one.
 *
 * Measured rather than typed: the four places are read off the formations
 * themselves, and `motionBounds.test.ts` re-derives the number.
 */
export function deriveEvenness(step: Beat = DERIVE_STEP): EvennessMotion {
  const group = probeGroup(DUPLE_IMPROPER, 4, DUPLE_IMPROPER_FRAME);
  const ranking: EvennessRow[] = [];

  for (const id of travelFigureIds()) {
    const def = travelFigureOf(id);
    if (def === undefined) continue;
    const params = withDefaults(def, {}, def.beats);
    const steps = Math.round(def.beats / step);
    const halves: { role: string; first: number; second: number }[] = [];
    let plannable = true;
    for (const station of group.stations) {
      let first = 0;
      let second = 0;
      let previous: Vec2 | undefined;
      for (let i = 0; i <= steps; i++) {
        const t = i * step;
        let p: Vec2;
        try {
          p = def.sample(group, station.id, t, params).p;
        } catch {
          plannable = false;
          break;
        }
        if (previous !== undefined) {
          if (t <= def.beats / 2) first += dist(previous, p);
          else second += dist(previous, p);
        }
        previous = p;
      }
      if (!plannable) break;
      halves.push({ role: station.id, first, second });
    }
    if (!plannable) continue;
    ranking.push({ id, ...spreadsOf(halves, def.beats) });
  }

  ranking.sort((a, b) => b.roleSpread - a.roleSpread || a.id.localeCompare(b.id));
  return {
    spread: floorAspect(),
    spreadAt: "the minor set's own rectangle, long side over short",
    ranking,
  };
}

/** One figure's two spreads, from each role's two half-path-lengths. */
function spreadsOf(
  halves: readonly { role: string; first: number; second: number }[],
  beats: Beat,
): Omit<EvennessRow, "id"> {
  const moved = halves.filter((h) => h.first + h.second >= STILL_BODY_PX);
  let roleSpread = 0;
  let fastest = "";
  if (moved.length >= 2 && beats > 0) {
    let high = -Infinity;
    let low = Infinity;
    for (const h of moved) {
      const mean = (h.first + h.second) / beats;
      if (mean > high) {
        high = mean;
        fastest = h.role;
      }
      low = Math.min(low, mean);
    }
    roleSpread = high / low;
  }
  let partSpread = 0;
  let worst = "";
  for (const h of moved) {
    const low = Math.min(h.first, h.second);
    if (low < STILL_BODY_PX) continue;
    const ratio = Math.max(h.first, h.second) / low;
    if (ratio > partSpread) {
      partSpread = ratio;
      worst = h.role;
    }
  }
  return { roleSpread, partSpread, at: `fastest ${fastest || "—"}, halves ${worst || "—"}` };
}

/**
 * The aspect of the minor set's own rectangle: its long side over its short
 * one, over every formation the library dances.
 *
 * Read off the stations rather than off the two constants, so that a formation
 * that laid its places out differently would move the bound rather than
 * silently disagree with it. The **largest** aspect wins, because a bound has
 * to hold on the most out-of-square floor there is. All three are 1.6 today.
 */
export function floorAspect(): number {
  let worst = 0;
  for (const formation of [DUPLE_IMPROPER, PROPER, BECKET]) {
    const places = formation.group(4);
    const gaps = new Set<number>();
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        gaps.add(Number(dist(places[i]!.p, places[j]!.p).toFixed(6)));
      }
    }
    const sorted = [...gaps].sort((a, b) => a - b);
    const short = sorted[0];
    const long = sorted[1];
    if (short === undefined || long === undefined || short <= 0) continue;
    worst = Math.max(worst, long / short);
  }
  return worst;
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
  let elbowRatio = 0;
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
      const hands = dist(hand.p, previous.hand.p) / step;
      const elbows = dist(elbow, previous.elbow) / step;
      handSpeed = Math.max(handSpeed, hands);
      elbowSpeed = Math.max(elbowSpeed, elbows);
      elbowRatio = Math.max(elbowRatio, elbows / Math.max(hands, STILL_HAND_PX));
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
    elbowRatio,
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
  travel: TravelMotion;
  evenness: EvennessMotion;
  bounds: MotionBounds;
} {
  const extremes = takeExtremes(step);
  const take = deriveTakeMotion(extremes.floorPx, extremes.drop, step);
  const travel = deriveTravel(step);
  const evenness = deriveEvenness(step);
  return {
    extremes,
    take,
    travel,
    evenness,
    bounds: {
      handSpeedPx: GUARD_FACTOR * take.handSpeed,
      elbowSpeedPx: GUARD_FACTOR * take.elbowSpeed,
      elbowPerHand: GUARD_FACTOR * take.elbowRatio,
      heightRatePx: GUARD_FACTOR * take.heightRate,
      // A hanging hand swings forward and back once a beat: an out-and-back of
      // exactly `2 × HAND_HANG_SWING_PX`, and the only one the model asks for.
      dipPx: GUARD_FACTOR * 2 * HAND_HANG_SWING_PX,
      travelPx: TRAVEL_GUARD_FACTOR * travel.travelPx,
      // M10b: the floor's own aspect, with no guard factor on top; see
      // `deriveEvenness` for why a ratio whose ideal is 1 takes none.
      spread: evenness.spread,
    },
  };
}

/**
 * The bounds, as re-derived on 2026-09-14 by F3c, again the same day by F4 and
 * F5 when the worst take in the registry got shorter, and again by F7 when the
 * rigid courtesy turn made it longer, written down so the oracle is not
 * re-deriving itself out of its own defects.
 *
 * `motionBounds.test.ts` re-runs {@link deriveBounds} and fails if any of these
 * has moved, so the numbers stay honest without the oracle chasing the code.
 *
 * | | legitimate maximum | × 3 = the bound |
 * | --- | ---: | ---: |
 * | hand floor speed | 23.7372 px/beat | 71.2116 |
 * | elbow floor speed | 59.2183 px/beat | 177.6548 |
 * | elbow speed / hand speed, per sample | 3.1944× | 9.5833 |
 * | hand height rate | 21.7217 px/beat | 65.1650 |
 * | out-and-back inside a beat | 1.2 px | 3.6 |
 *
 * ## M10c, 2026-09-16: re-derived because the reference figure moved (DD76)
 *
 * **The worst take in the registry is the chain's own pull by**, and the user
 * ruled on the chain's timing: *"in the chain the pull-by is still too fast and
 * the turn too slow. it should be about 4 beats each."* A pull by that takes
 * four beats instead of two holds its two robins' right hands across more
 * ground, so the reach this whole table is derived from went from **15.2143 px
 * to 17.0152 px** and every guard derived from it moved with it:
 *
 * | | before | after |
 * | --- | ---: | ---: |
 * | reach, hip to held point | 15.2143 px | **17.0152** |
 * | hand floor speed | 22.7917 → 68.375 | **25.4896 → 76.4688** |
 * | elbow floor speed | 62.7703 → 188.3108 | **67.3223 → 201.9670** |
 * | elbow / hand, per sample | 3.2955 → 9.8864 | **3.3819 → 10.1458** |
 * | hand height rate | 21.7217 → 65.1650 | unchanged |
 * | out-and-back inside a beat | 1.2 → 3.6 | unchanged |
 * | sustained travel | 15.5463 → 23.3194 | unchanged (the swing) |
 * | evenness | 1.6 | unchanged (the floor's rectangle) |
 *
 * **These bounds follow their reference figure; they are not a tolerance being
 * raised.** That is what re-deriving is *for*, and it has happened four times
 * before — F3c, F4, F5 and F7, the last of which moved the reach the other way
 * when the rigid courtesy turn got longer. A bound derived from the chain's own
 * take cannot also be a guard on the chain's timing: that is circular, and
 * leaving it pinned would have frozen a figure's count against a user ruling.
 * Every *other* figure in the library is measured against the new numbers and
 * still passes, which is the check that this is a re-derivation and not a
 * licence.
 *
 * **The reach came down for four milestones and has gone back up once.** The
 * furthest any figure reaches from a hip to a hand it holds was 17.8986 px
 * before F4 — the courtesy turn in right and left through, whose couple had
 * been sliding sideways across the set with its hands joined — then 16.1152
 * when F4 made it turn, then 14.7814 when F5 made both courtesy turns close up
 * on to a hold. F7 takes it to **15.8454 px**, and the reach is a different
 * one: `robins-chain 1R R at t=1.563`, a robin's own right hand on the pull
 * by's shared point. The rigid turn's take sits on the near side of the
 * couple's centre, so the two robins pull by 13.4 px apart instead of meeting,
 * and each of them reaches half of that plus her own shoulder. AC1 still solves
 * every hand with a shortfall of exactly 0: this is a hip-to-point distance,
 * not an arm, and the arm is measured from the shoulder.
 *
 * **A longer take is a faster hand and a slower elbow**, which is the same
 * mechanism as F5's in reverse: more of a long take is spent out where the
 * elbow's azimuth is settled. The hand's peak went 22.1432 → 23.7372 px/beat
 * and its guard up with it; the elbow's peak went 65.3205 → 59.2183 and the
 * per-sample ratio 3.5298 → 3.1944, so those two guards **tightened**. The
 * ratio guard is still the one that discriminates, and nothing in the library
 * is near it.
 *
 * **The elbow bound F3a derived was useless, and F3c found out why.** A take
 * moved the elbow at 250 px/beat — 9.33× the hand — which made the guard 750
 * px/beat, a number nothing would ever trip. That was not the elbow being
 * intrinsically unbounded: it was the elbow pole lining up with the arm part
 * way through the take and the elbow flipping through 180°. With the pole
 * capped (`ELBOW_POLE_ALONG_FRACTION` in `@caller/core`) the same take moves
 * the elbow at 68 px/beat, and the guard means something again.
 *
 * The **ratio** is the bound that discriminates, and it is derived the same
 * way: the worst per-sample `elbow speed / hand speed` an honest take produces,
 * with the hand floored at `STILL_HAND_PX` so an elbow that swings while the
 * hand is still is still counted. A take does 3.26×; the guard is three times
 * that. F3a saw `long-lines` at 15.8× against `balance-ring` at 1.26×, which is
 * what made the ratio worth reporting in the first place.
 */
export const CONTRA_MOTION_BOUNDS: MotionBounds = {
  handSpeedPx: 76.4688,
  // FR-D2b: 201.967 before the hanging elbow pole; see `CONTRA_TAKE_MOTION`.
  elbowSpeedPx: 223.2355,
  // FR-D2b: 10.1458 before the hanging elbow pole; the ratio the take produces
  // went 3.3819 -> 3.7381 and the guard is three times it. Every figure in the
  // library still passes against the new number **and against the old one** -
  // nothing in the programme is between the two, and the worst in it went down
  // (the swing, 8.39x -> 7.78x).
  elbowPerHand: 11.2142,
  heightRatePx: 65.165,
  dipPx: 3.6,
  // M10, R6: 1.5 × the swing's own orbit; see `CONTRA_TRAVEL_MOTION`.
  travelPx: 23.3194,
  // M10b: the minor set's own rectangle; see `CONTRA_EVENNESS`.
  spread: 1.6,
};

/**
 * **The sustained-travel bound** (M10, R6, director debt 8), derived by
 * {@link deriveTravel} and re-derived by `motionBounds.test.ts`.
 *
 * The reference is the swing's own orbit at **15.5463 px/beat** over a one-beat
 * window (`swing 1R to t=1.500`), and the guard is
 * {@link TRAVEL_GUARD_FACTOR} = 1.5, giving **23.3194 px/beat**. A walk faster
 * than one and a half swings is a run.
 *
 * ### What M10's cruise did to the ranking
 *
 * Every figure run alone at its nominal count, before and after, px per beat:
 *
 * | figure | before | after |
 * | --- | ---: | ---: |
 * | `star` | 22.3149 | 18.8480 |
 * | `robins-chain` | 18.3288 | 19.7104 |
 * | `california-twirl` | 18.4557 | 12.7854 |
 * | `circle` | 16.7369 | 14.1360 |
 * | `petronella` | 14.4224 | 13.2115 |
 * | `right-and-left-through` | 13.1254 | 13.1254 |
 * | `pass-through` | 11.8952 | 11.0728 |
 * | `roll-away` | 11.8678 | 10.9908 |
 * | `long-lines` | 3.4437 | 3.0000 |
 *
 * The chain went **up**, and that is the ruling rather than a regression: its
 * orbit turns at a constant rate now, which is what puts the lark 77° round at
 * the two-beat join instead of 56°, and a constant rate over the middle of the
 * figure is faster in the middle than a smoothstep's own peak is wide.
 *
 * **M10b took 0.58 px/beat of that back**: 19.7104 → **19.1282**, by making the
 * chain's opening out a chord instead of a spiral. The worst beat of a chain —
 * which was the worst beat in the library — went from 17.09 px/beat to 15.37.
 *
 * ### The figures above the bound, run alone
 *
 * Three, and each is a fact about the probe rather than about a dance — a
 * figure run alone in a duple improper group of four is not always in the
 * formation it is danced in. They are named in
 * `dances/motionAllowlist.ts` where a dance actually calls them.
 *
 * | figure | alone | why |
 * | --- | ---: | --- |
 * | `bend-the-line` | 28.8617 | a two-beat figure probed outside a line of four: the ends swing a whole set's width round in two beats. No programme dance calls it. |
 * | `square-through` | 22.7908 | under the bound, but only just; a square figure probed in a contra four. |
 * | `interrupted-square-through` | 22.7908 | the same figure's own variant. |
 */
export const CONTRA_TRAVEL_MOTION = {
  /** The swing's own orbit, px per beat over a one-beat window. */
  travelPx: 15.5463,
  travelAt: "swing 1R to t=1.500",
  /** The fastest figure in the ranking, which is not the reference; see above. */
  fastestPx: 28.8617,
  fastestId: "bend-the-line",
} as const;

/**
 * **The evenness bound** (M10b), derived by {@link deriveEvenness} and
 * re-derived by `motionBounds.test.ts`.
 *
 * The minor set is 32 px across and 20 px along in all three formations, so the
 * bound is **1.6** and it is the same number for `roleSpread` and for
 * `partSpread`. See {@link deriveEvenness} for why there is no guard factor.
 *
 * ### The library, run alone at its nominal count
 *
 * Every figure that can be planned over a whole minor set standing alone, worst
 * role spread first. `—` is a figure where fewer than two roles moved at all,
 * which is not an even figure but an unmeasured one.
 *
 * | figure | roles × | halves × | note |
 * | --- | ---: | ---: | --- |
 * | `bend-the-line` | 1.9577 | 2.5815 | a two-beat figure probed outside the line of four it is danced in; the same probe artefact as its travel row. No programme dance calls it. |
 * | `robins-chain` | 1.7584 | 1.3268 | **M10b's own figure**, 1.7641 / 1.3344 before, and still over on `roles`: see `dances/motionAllowlist.ts`, which has the arithmetic and the whole lever sweep. |
 * | `single-file-promenade` | 1.5960 | 1.0135 | the figure that walks the rectangle itself, and the evidence for the bound. |
 * | `petronella` | 1.5455 | 1.0000 | one place clockwise round the ring, which is the rectangle again. |
 * | `interrupted-square-through` | 1.0000 | 7.2051 | it is *interrupted*: the figure stops in the middle by construction. |
 * | `balance` | 1.0000 | 1.7146 | a rock in and a rock out, which is not one walk. |
 * | `down-the-hall` / `up-the-hall` | 1.0921 | 1.6954 | walk down, then turn at the bottom. |
 *
 * Everything else in the library is inside the bound on both columns; the whole
 * ranking is what `deriveEvenness` returns and what the test pins.
 */
export const CONTRA_EVENNESS = {
  /** The bound: the long side of the minor set's rectangle over its short side. */
  spread: 1.6,
  /** Across the set, px. */
  acrossPx: 32,
  /** Along the set, px. */
  alongPx: 20,
  /** The figure whose measured spread is the evidence for the bound. */
  witnessId: "single-file-promenade",
  witnessSpread: 1.596,
} as const;

/**
 * The measured legitimate maxima the bounds above are three times.
 *
 * F13 moved these: the worst take in the registry is still `robins-chain`'s
 * own, but the chain's default is now the lark's orbit (F10's candidate 5),
 * whose pull by is a two-beat take rather than the earlier rigid turn's
 * four-and-a-half-beat one — a shorter take reaches less far and needs less
 * speed to get there. `motionBounds.test.ts` re-derives these; they are not
 * retuned by hand.
 */
export const CONTRA_TAKE_MOTION = {
  /** The furthest hip-to-placed-point reach in the registry, px. */
  floorPx: 17.0152,
  floorAt: "robins-chain 1R R at t=1.500",
  /** The smallest drop any figure holds a hand at, px. */
  drop: 0,
  dropAt: "swing 1R L at t=1.000",
  handSpeed: 25.4896,
  // FR-D2b: 67.3223 before the hanging elbow pole. The take begins from a hand
  // hanging at `HAND_HANG_DROP_PX`, so its first beats are inside the new drop
  // band and the elbow crosses it as the hand comes up — six px of drop, and
  // this is the whole of what it costs.
  elbowSpeed: 74.4118,
  heightRate: 21.7217,
  // FR-D2b: 2.6412 before the hanging elbow pole.
  elbowPerHand: 2.9193,
  // FR-D2b: 3.3819 before the hanging elbow pole.
  elbowRatio: 3.7381,
  hangingDipPx: 2 * HAND_HANG_SWING_PX,
} as const;

const SIDES: readonly Side[] = ["L", "R"];

/** The frame the derivation probes on: the set down the hall, on the origin. */
const DUPLE_IMPROPER_FRAME = makeFrame([0, 0], 90);
