import { ARM_REACH_PX, SHOULDER_FORWARD_PX, SHOULDER_WIDTH_PX, dirOf, rightOf } from "@caller/core";
import { HEIGHTS } from "../body/Body.js";
import type { DancerId } from "../dialect/Dialect.js";
import { free } from "../holds/free.js";
import type { BodyFrame } from "../holds/HoldPosture.js";
import { holdPosture } from "../holds/library.js";
import type { Hand, HoldId } from "../ir/Hold.js";
import { dist, lerp, type Vec3 } from "../motion/Vec3.js";
import { TAKE_BEATS } from "../units/limits.js";
import type { Tempo } from "../units/Tempo.js";
import { rampAt } from "./ramps.js";

/**
 * One hand, over the whole program: where it is at every sample, and how much
 * of a take has ramped in.
 *
 * A hand's target is never a point the executor stores — it is a **function
 * of the two bodies** at that sample, read off the hold's posture (D4). A
 * take or a drop blends the old function into the new one over `TAKE_BEATS`,
 * `p(t) = lerp(prev(t), next(t), r(t))` with `r` the cosine ramp: blending the
 * *functions* rather than their values at the seam is what keeps a hand
 * continuous while the bodies are moving underneath it, which on a walking
 * take they always are.
 *
 * Because each event blends the whole history so far into its own target, a
 * second event landing before the first has finished simply blends the
 * half-finished curve onward: no case, no clamp, no discontinuity.
 */
export const handPath = (
  events: readonly HoldEvent[],
  hand: Hand,
  self: readonly BodyFrame[],
  others: ReadonlyMap<DancerId, readonly BodyFrame[]>,
  tempo: Tempo,
): HandPath => {
  const length = self.length;
  const target: Vec3[] = new Array(length);
  const weight: number[] = new Array(length);
  const ordered = [...events].sort((a, b) => a.beat - b.beat);

  for (let i = 0; i < length; i++) {
    const beat = i / tempo.samplesPerBeat;
    let point = hangAt(self, i, hand);
    let held = 0;
    for (const event of ordered) {
      const r = rampAt(beat, event.beat, TAKE_BEATS);
      if (r === 0) break;
      point = lerp(point, holdTargetAt(event, self, others, i, hand), r);
      held = held + ((event.hold === undefined ? 0 : 1) - held) * r;
    }
    target[i] = point;
    weight[i] = held;
  }
  return { target, weight };
};

/** One hand's sampled points, and its take weight 0 (free) to 1 (fully held). */
export interface HandPath {
  target: readonly Vec3[];
  weight: readonly number[];
}

/**
 * A take or a release, at the beat its ramp starts on. `hold` undefined is a
 * release: the hand goes back to the hang.
 */
export interface HoldEvent {
  beat: number;
  hold: HoldId | undefined;
  with?: DancerId;
}

/**
 * How far a hand may be from the shoulder before the arm cannot reach it —
 * the contract's 15 px, two 7.5 px bones straight out.
 */
export const HAND_REACH_PX = ARM_REACH_PX;

/**
 * The shoulder a hand hangs off: up the torso from the hips, a little forward,
 * and half the shoulder width out to its own side.
 *
 * The executor computes it only to ask whether a take is reachable. The
 * solver's shoulder is the same point with the lean folded in; a take is
 * checked upright, because whether a figure's hands are within reach of each
 * other is a property of the figure, not of how far anyone happens to be
 * leaning at the moment it is taken.
 */
export const shoulderAnchor = (frame: BodyFrame, hand: Hand): Vec3 => {
  const forward = dirOf(frame.yawDeg);
  const right = rightOf(frame.yawDeg);
  const half = ((hand === "right" ? 1 : -1) * SHOULDER_WIDTH_PX) / 2;
  return {
    x: frame.hip.x + forward[0] * SHOULDER_FORWARD_PX + right[0] * half,
    y: frame.hip.y + forward[1] * SHOULDER_FORWARD_PX + right[1] * half,
    z: HEIGHTS.shoulderPx,
  };
};

/**
 * How far past the arm's reach a take's target is at the moment the ramp
 * starts, or 0 when it is reachable.
 *
 * Reported, never clamped: a hand that cannot get where the figure says it
 * goes is the **scheduler's** mistake — the two dancers are too far apart to
 * take hands — and quietly shortening the arm would hide exactly the thing
 * the proof exists to find.
 */
export const reachOverrun = (frame: BodyFrame, hand: Hand, point: Vec3): number => {
  const d = dist(shoulderAnchor(frame, hand), point);
  return d > HAND_REACH_PX ? d : 0;
};

const hangAt = (self: readonly BodyFrame[], i: number, hand: Hand): Vec3 =>
  free.target(self[i]!, undefined, hand);

/** Where one event's hold puts `hand` at sample `i`, ramps ignored. */
export const holdTargetAt = (
  event: HoldEvent,
  self: readonly BodyFrame[],
  others: ReadonlyMap<DancerId, readonly BodyFrame[]>,
  i: number,
  hand: Hand,
): Vec3 => {
  if (event.hold === undefined) return hangAt(self, i, hand);
  const other = event.with === undefined ? undefined : others.get(event.with)?.[i];
  return holdPosture(event.hold).target(self[i]!, other, hand);
};
