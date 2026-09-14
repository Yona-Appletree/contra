import type { Beat, PoseSample, Side } from "@caller/core";
import { angleDiff, dist, shoulders, solveArm } from "@caller/core";
import type { DancerId } from "../formation/Formation.js";
import type { Timeline } from "../timeline/Timeline.js";
import { poseAt, sampleEvent } from "../timeline/poseAt.js";

/**
 * The three oracles the plan makes every dance answer to: closure (AC5),
 * reach (AC1) and collisions (AC6).
 *
 * They run over a timeline, so they work the same for the fixture dance here,
 * the square fixture that proves the model is form-neutral, and every encoded
 * dance M9 adds. None of them knows what a contra is.
 */

/** How finely AC1 and AC6 are checked: every 1/8 beat. */
export const ORACLE_STEP: Beat = 1 / 8;

/** AC5: the gap between where a figure leaves a dancer and where the next one picks them up. */
export interface ClosureReport {
  /** The largest gap in px. */
  maxPositionError: number;
  /** The largest turn in degrees, unsigned. */
  maxFacingError: number;
  /** Where the largest gap was. */
  worst?: { dancer: DancerId; beat: Beat; from: string; to: string };
  /** How many seams were checked. */
  seams: number;
}

/**
 * Check every figure seam: the pose a figure leaves a dancer in must be the
 * pose the next figure starts them from.
 *
 * This is stronger than AC5 asks for and includes it: the seam at the end of a
 * time through compares the last figure's `ends` against the first figure of
 * the *progressed* set, which is exactly "within 0.01 px of the progressed
 * start position".
 */
export function closureReport(timeline: Timeline, dancers = timeline.dancers()): ClosureReport {
  const report: ClosureReport = { maxPositionError: 0, maxFacingError: 0, seams: 0 };
  for (const dancer of dancers) {
    const events = timeline.figuresOf(dancer);
    for (let i = 1; i < events.length; i++) {
      const previous = events[i - 1]!;
      const next = events[i]!;
      const leaves = sampleEvent(timeline, previous, dancer, previous.end - previous.start);
      const arrives = sampleEvent(timeline, next, dancer, 0);
      const gap = dist(leaves.p, arrives.p);
      const turn = Math.abs(angleDiff(leaves.facing, arrives.facing));
      report.seams += 1;
      report.maxFacingError = Math.max(report.maxFacingError, turn);
      if (gap > report.maxPositionError) {
        report.maxPositionError = gap;
        report.worst = { dancer, beat: next.start, from: previous.figure, to: next.figure };
      }
    }
  }
  return report;
}

/** AC1: how far out of reach the worst hand in the whole dance was. */
export interface ReachReport {
  /** The largest shortfall in px. `0` is the invariant holding. */
  maxShort: number;
  worst?: { dancer: DancerId; beat: Beat; side: Side };
  /** How many hand placements were checked. */
  hands: number;
}

/** Solve every placed hand at every step and report the worst shortfall. */
export function reachReport(
  timeline: Timeline,
  from: Beat,
  to: Beat,
  dancers = timeline.dancers(),
  step: Beat = ORACLE_STEP,
): ReachReport {
  const report: ReachReport = { maxShort: 0, hands: 0 };
  forEachStep(from, to, step, (beat) => {
    for (const dancer of dancers) {
      const sample = poseAt(timeline, dancer, beat);
      const sh = shoulders(sample);
      for (const side of SIDES) {
        const hand = sample.hands[side];
        if (hand === "down") continue;
        report.hands += 1;
        const { short } = solveArm(sh[side], hand, side, sample.facing);
        if (short > report.maxShort) {
          report.maxShort = short;
          report.worst = { dancer, beat, side };
        }
      }
    }
  });
  return report;
}

/** AC6: how close the closest two dancers ever came. */
export interface CollisionReport {
  /** The smallest torso-centre distance in px. */
  minDistance: number;
  worst?: { a: DancerId; b: DancerId; beat: Beat };
  /** How many pairs were checked. */
  pairs: number;
}

/**
 * The closest two dancers come, over every step.
 *
 * `exempt` lets a caller excuse the pairs AC6 excuses — the two dancers of a
 * swing or an allemande, who are meant to be close.
 */
export function collisionReport(
  timeline: Timeline,
  from: Beat,
  to: Beat,
  dancers = timeline.dancers(),
  step: Beat = ORACLE_STEP,
  exempt: (a: DancerId, b: DancerId, beat: Beat) => boolean = () => false,
): CollisionReport {
  const report: CollisionReport = { minDistance: Infinity, pairs: 0 };
  forEachStep(from, to, step, (beat) => {
    const poses = new Map<DancerId, PoseSample>();
    for (const dancer of dancers) poses.set(dancer, poseAt(timeline, dancer, beat));
    for (let i = 0; i < dancers.length; i++) {
      for (let j = i + 1; j < dancers.length; j++) {
        const a = dancers[i]!;
        const b = dancers[j]!;
        if (exempt(a, b, beat)) continue;
        report.pairs += 1;
        const d = dist(poses.get(a)!.p, poses.get(b)!.p);
        if (d < report.minDistance) {
          report.minDistance = d;
          report.worst = { a, b, beat };
        }
      }
    }
  });
  return report;
}

/**
 * Every dancer has exactly one figure at every beat of `[from, to]`, with no
 * gap and no overlap. Returns the problems, empty when the timeline is sound.
 */
export function coverageProblems(timeline: Timeline, from: Beat, to: Beat): string[] {
  const problems: string[] = [];
  for (const dancer of timeline.dancers()) {
    const events = timeline.figuresOf(dancer);
    let at = from;
    for (const event of events) {
      if (event.end <= at) continue;
      if (event.start > at) {
        problems.push(`${dancer}: nothing from ${at} to ${event.start}`);
      } else if (event.start < at && at !== from) {
        problems.push(`${dancer}: "${event.figure}" overlaps back to ${event.start} at ${at}`);
      }
      at = Math.max(at, event.end);
      if (at >= to) break;
    }
    if (at < to) problems.push(`${dancer}: covered only to ${at}, wanted ${to}`);
  }
  return problems;
}

const SIDES: readonly Side[] = ["L", "R"];

/** Walk `[from, to]` inclusive in exact multiples of `step`, avoiding drift. */
function forEachStep(from: Beat, to: Beat, step: Beat, visit: (beat: Beat) => void): void {
  const steps = Math.round((to - from) / step);
  for (let i = 0; i <= steps; i++) visit(from + i * step);
}
