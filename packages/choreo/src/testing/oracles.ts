import type { Beat, Hand, PoseSample, Side, Vec2 } from "@caller/core";
import {
  HAND_HANG_SWING_PX,
  SEAM_BEATS,
  angleDiff,
  dist,
  drawnArms,
  shoulders,
  solveArm,
} from "@caller/core";
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

/**
 * The motion oracle (F3a): how fast a drawn arm moves, and where it jumps.
 *
 * The other three oracles ask whether the model is self-consistent — closure,
 * reach, collisions — and every dance in the library passes all three while
 * still looking wrong. This one asks a different question: does what is drawn
 * *move continuously*? It samples the arm the renderer actually draws, through
 * `@caller/core`'s `drawnArms`, because the elbow is what reads as a jump even
 * when the hand barely moves, and it attributes every number to a figure
 * instance and — for the first `SEAM_BEATS` of one — to the seam that led into
 * it, because a seam belongs to neither figure alone.
 *
 * It reports; it does not judge. The bounds live with the caller, and
 * `@caller/contra`'s own test is where today's defects are listed.
 *
 * Since M10 it also measures the **body**, once, in the `travel` column: the
 * fastest any dancer moves averaged over a sliding one-beat window. Every other
 * column is about a drawn arm, and a figure can pass all of them while walking
 * its dancers across the hall at a run.
 */

/** How finely the motion oracle samples: every 1/32 beat. */
export const MOTION_STEP: Beat = 1 / 32;

/** One measurement and the dancer, beat and hand that produced it. */
export interface MotionWorst {
  /** The measured value; `0` when nothing was measured. */
  value: number;
  dancer?: DancerId;
  beat?: Beat;
  side?: Side;
}

/** What one figure id, or one `prev → next` seam pair, measured. */
export interface MotionStats {
  /** A figure id, or `"prev → next"` for a seam pair. */
  key: string;
  /** Worst floor speed of a hand, px per beat. */
  handSpeed: MotionWorst;
  /** Worst floor speed of an elbow, px per beat. */
  elbowSpeed: MotionWorst;
  /**
   * Worst ratio of the elbow's floor speed to the hand's, per sample.
   *
   * The elbow cannot be bounded by a speed of its own: a folded arm puts the
   * elbow several px off the shoulder-hand line, so a body turning under a
   * still hand moves it legitimately. What reads as flail is the elbow moving
   * *far faster than the hand it belongs to* — F3a measured `long-lines` at an
   * elbow of 334 px/beat against a hand of 21. The hand's speed is floored at
   * {@link STILL_HAND_PX}, the fastest a hand moves while its dancer stands
   * still, so an elbow that swings while the hand is stationary still counts.
   */
  elbowPerHand: MotionWorst;
  /** Worst rate of change of a hand's height, px per beat. */
  heightRate: MotionWorst;
  /**
   * **Sustained travel**: the fastest any dancer's body moves, averaged over a
   * sliding one-beat window, px per beat.
   *
   * The column R6 asked for (director debt 8), and the one the motion profiles
   * are about. Every other column here measures a *hand* or an *elbow* — the
   * drawn arm — and a figure can pass all of them while walking its dancers
   * across the hall at a run. What separates a walk from a take is that a take
   * is over inside a beat and a walk is not, so the number is an average over a
   * beat rather than the difference of two 1/32-beat samples: a dancer who is
   * briefly fast because a figure hands them on to another is not running, and
   * a dancer who holds 20 px/beat for a whole beat is.
   *
   * Body speed, not hand speed, so it is a fact about the **figure's own path**
   * rather than about what the arms are doing over it. `side` is left out: a
   * body has no side.
   */
  travel: MotionWorst;
  /** Worst rate of change of an elbow's height, px per beat. Not tabled. */
  elbowHeightRate: MotionWorst;
  /** How many times a hand flipped between placed and hanging. */
  stateFlips: number;
  /** Where the first state flip was. */
  firstFlip?: { dancer: DancerId; beat: Beat; side: Side };
  /**
   * How far a hand moved in the step where its state flipped, px.
   *
   * A flip on its own is not a defect: a hand a figure placed and the next
   * figure leaves `'down'` really does stop being placed, and the label has to
   * change somewhere. What the user sees is whether the hand **jumps** when it
   * does. Before F3c the seam switched the two at its midpoint and this was the
   * whole distance between them; with the take and the release animated it is
   * no larger than an ordinary step.
   */
  flipJump: MotionWorst;
  /**
   * How many samples had a hand or an elbow that was not a finite number.
   *
   * Counted explicitly because it is the one failure every other oracle is
   * blind to: `NaN > max` is false, so a `NaN` hand slides through a maximum
   * silently, and a `NaN` arm draws as nothing at all. An arm that vanishes
   * is the worst continuity failure there is, so it gets its own column.
   */
  nonFinite: number;
  /** Where the first non-finite sample was. */
  firstNonFinite?: { dancer: DancerId; beat: Beat; side: Side };
  /**
   * The worst out-and-back: how far a hand travelled between two consecutive
   * reversals of its own direction, when the two fell inside one beat.
   */
  dip: MotionWorst;
  /** How many direction reversals of a hand's motion, in total. */
  reversals: number;
  /** How many (dancer, hand, step) measurements went into the numbers above. */
  samples: number;
}

/** What {@link motionReport} found. */
export interface MotionReport {
  from: Beat;
  to: Beat;
  step: Beat;
  /** Per figure id, worst first. */
  figures: MotionStats[];
  /** Per `prev → next` seam pair, worst first. */
  seams: MotionStats[];
  /** Everything, in one row, for a one-line summary. */
  overall: MotionStats;
  /** The bounds the rows were sorted against. */
  bounds: MotionBounds;
}

/**
 * What the oracle sorts against. These are guards, not tuning targets: see
 * `@caller/contra`'s `motionBounds.ts` for how the library's own numbers are
 * derived and how much headroom each one carries.
 */
export interface MotionBounds {
  /** Floor speed of a hand, px per beat. */
  handSpeedPx: number;
  /** Floor speed of an elbow, px per beat. */
  elbowSpeedPx: number;
  /** Elbow floor speed as a multiple of the hand's; see {@link MotionStats.elbowPerHand}. */
  elbowPerHand: number;
  /** Rate of change of a hand's height, px per beat. */
  heightRatePx: number;
  /**
   * Sustained body travel over a one-beat window, px per beat; see
   * {@link MotionStats.travel}.
   */
  travelPx: number;
  /** An out-and-back inside one beat, px. */
  dipPx: number;
}

/** How the motion oracle is run. */
export interface MotionOptions {
  /** First beat sampled. Defaults to the first figure in the timeline. */
  from: Beat;
  step: Beat;
  dancers: DancerId[];
  bounds: MotionBounds;
}

/**
 * Bounds wide enough that nothing in a hand-written figure library trips them
 * by accident. `@caller/contra` derives its own from the registry and passes
 * them in; these are what a caller gets for not saying.
 */
export const DEFAULT_MOTION_BOUNDS: MotionBounds = {
  handSpeedPx: 60,
  elbowSpeedPx: 60,
  elbowPerHand: 10,
  heightRatePx: 60,
  dipPx: 6,
  // Wide enough that nothing hand-written trips it: `@caller/contra` derives
  // its own from the library (`CONTRA_TRAVEL_MOTION`) and passes it in.
  travelPx: 40,
};

/**
 * How fast a hand moves while its dancer stands still, px per beat: the hanging
 * hand's own swing, `2π × HAND_HANG_SWING_PX`.
 *
 * It is the floor under the hand's speed in {@link MotionStats.elbowPerHand}, so
 * the ratio is a number rather than a division by nothing, and an elbow that
 * swings while the hand is stationary is still counted against it.
 */
export const STILL_HAND_PX = 2 * Math.PI * HAND_HANG_SWING_PX;

/**
 * Sample every dancer at {@link MOTION_STEP} and report how the drawn arms
 * moved, per figure id and per seam pair, worst first.
 */
export function motionReport(
  timeline: Timeline,
  until: Beat,
  options: Partial<MotionOptions> = {},
): MotionReport {
  const dancers = options.dancers ?? timeline.dancers();
  const step = options.step ?? MOTION_STEP;
  const bounds = options.bounds ?? DEFAULT_MOTION_BOUNDS;
  const from = options.from ?? firstFigureBeat(timeline, dancers);

  const figures = new Map<string, MotionStats>();
  const seams = new Map<string, MotionStats>();
  const overall = emptyStats("everything");

  const steps = Math.round((until - from) / step);
  /** The previous sample for each (dancer, hand), and its running direction. */
  const trail = new Map<string, HandTrail>();
  /**
   * Each dancer's distance travelled so far, one entry per step, so the
   * sustained-travel column can look a whole beat back.
   */
  const travelled = new Map<DancerId, BodyTrail>();
  /** How many steps make a beat, which is the window `travel` is averaged over. */
  const travelWindow = Math.max(1, Math.round(1 / step));

  for (let i = 0; i <= steps; i++) {
    const beat = from + i * step;
    for (const dancer of dancers) {
      const event = timeline.figureAt(dancer, beat);
      if (!event) continue;
      const pose = poseAt(timeline, dancer, beat);
      const drawn = drawnArms(pose, beat);

      const inSeam = beat - event.start < SEAM_BEATS;
      const previous = inSeam ? timeline.figureBefore(dancer, event.start) : undefined;
      const rows = [
        overall,
        statsFor(figures, event.figure),
        ...(previous ? [statsFor(seams, `${previous.figure} → ${event.figure}`)] : []),
      ];

      // **Sustained travel** (R6): how far this body has come in the last beat.
      // The window is allowed to reach back across a figure boundary, and the
      // row it counts against is the figure that owns the *end* of it: a dancer
      // still running a beat into the next figure is that figure's problem as
      // much as the last one's.
      const body = bodyTrailOf(travelled, dancer, pose.p);
      if (body.along.length > travelWindow) {
        const here = body.along[body.along.length - 1]!;
        const back = body.along[body.along.length - 1 - travelWindow]!;
        for (const row of rows) keep(row.travel, here - back, { dancer, beat });
      }

      for (const [index, side] of SIDES.entries()) {
        const arm = drawn.arms[index]!;
        const hand = drawn.hands[side];
        const now: HandTrail = {
          beat,
          hand: hand.p,
          handHeight: -hand.drop,
          elbow: arm.elbow,
          elbowHeight: arm.elbowZ,
          hanging: drawn.hanging[side],
          local: bodyLocalHand(pose, hand),
          direction: undefined,
          lastReversal: undefined,
        };
        const key = `${dancer}/${side}`;
        const before = trail.get(key);
        trail.set(key, now);

        const where = { dancer, beat, side };
        if (!finiteTrail(now)) {
          for (const row of rows) {
            row.samples += 1;
            row.nonFinite += 1;
            row.firstNonFinite ??= where;
          }
          continue;
        }
        if (!before || !finiteTrail(before)) continue;

        const dt = beat - before.beat;
        if (dt <= 0) continue;
        for (const row of rows) {
          row.samples += 1;
          const handSpeed = dist(now.hand, before.hand) / dt;
          const elbowSpeed = dist(now.elbow, before.elbow) / dt;
          keep(row.handSpeed, handSpeed, where);
          keep(row.elbowSpeed, elbowSpeed, where);
          keep(row.elbowPerHand, elbowSpeed / Math.max(handSpeed, STILL_HAND_PX), where);
          keep(row.heightRate, Math.abs(now.handHeight - before.handHeight) / dt, where);
          keep(row.elbowHeightRate, Math.abs(now.elbowHeight - before.elbowHeight) / dt, where);
          if (now.hanging !== before.hanging) {
            row.stateFlips += 1;
            row.firstFlip ??= where;
            keep(row.flipJump, dist(now.hand, before.hand), where);
          }
        }

        // The hand's own direction, in the dancer's frame, so walking across
        // the room is not a reversal and a take-and-drop-and-take is.
        const move = sub3(now.local, before.local);
        const length = Math.hypot(move[0], move[1], move[2]);
        if (length < 1e-9) {
          now.direction = before.direction;
          now.lastReversal = before.lastReversal;
          continue;
        }
        const direction: Vec3 = [move[0] / length, move[1] / length, move[2] / length];
        const reversed =
          before.direction !== undefined && dot3(direction, before.direction) < REVERSAL_DOT;
        now.direction = direction;
        now.lastReversal = reversed ? { beat, local: before.local } : before.lastReversal;
        if (!reversed) continue;
        for (const row of rows) row.reversals += 1;
        const mark = before.lastReversal;
        if (mark === undefined || beat - mark.beat > 1) continue;
        // Two turns inside one beat: an out-and-back, which is the dip.
        const move2 = sub3(before.local, mark.local);
        const excursion = Math.hypot(move2[0], move2[1], move2[2]);
        for (const row of rows) keep(row.dip, excursion, where);
      }
    }
  }

  const severity = (s: MotionStats): number =>
    Math.max(
      s.handSpeed.value / bounds.handSpeedPx,
      s.elbowSpeed.value / bounds.elbowSpeedPx,
      s.elbowPerHand.value / bounds.elbowPerHand,
      s.heightRate.value / bounds.heightRatePx,
      s.travel.value / bounds.travelPx,
      s.dip.value / bounds.dipPx,
      s.stateFlips > 0 ? 1 : 0,
      // An arm that is not a number is drawn as nothing, which is worse than
      // any speed, so it sorts above everything else.
      s.nonFinite > 0 ? 1000 : 0,
    );
  const worstFirst = (rows: MotionStats[]): MotionStats[] =>
    rows.sort((a, b) => severity(b) - severity(a) || a.key.localeCompare(b.key));

  return {
    from,
    to: until,
    step,
    figures: worstFirst([...figures.values()]),
    seams: worstFirst([...seams.values()]),
    overall,
    bounds,
  };
}

/** A motion report as a markdown section: the bounds, then the two tables. */
export function formatMotionReport(report: MotionReport, top = Infinity): string {
  const lines: string[] = [];
  lines.push(
    `Sampled beats ${report.from} to ${report.to} every ${fraction(report.step)} beat. ` +
      `Bounds: hand ${report.bounds.handSpeedPx} px/beat, elbow ${report.bounds.elbowSpeedPx} px/beat, ` +
      `elbow/hand ${report.bounds.elbowPerHand}×, ` +
      `height ${report.bounds.heightRatePx} px/beat, dip ${report.bounds.dipPx} px, ` +
      `travel ${report.bounds.travelPx.toFixed(2)} px/beat.`,
  );
  lines.push("");
  lines.push("**Per figure**");
  lines.push("");
  lines.push(...motionTable(report.figures.slice(0, top)));
  lines.push("");
  lines.push("**Per seam** (`prev → next`, the first 0.4 beats of the second figure)");
  lines.push("");
  lines.push(...motionTable(report.seams.slice(0, top)));
  return lines.join("\n");
}

const MOTION_HEADER = [
  "| what | hand px/beat | elbow px/beat | elbow/hand | height px/beat | travel px/beat | flips | NaN | dip px | where the worst hand was |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
];

function motionTable(rows: readonly MotionStats[]): string[] {
  if (rows.length === 0) return ["_nothing measured._"];
  return [
    ...MOTION_HEADER,
    ...rows.map(
      (r) =>
        `| \`${r.key}\` | ${r.handSpeed.value.toFixed(1)} | ${r.elbowSpeed.value.toFixed(1)} | ` +
        `${r.elbowPerHand.value.toFixed(2)} | ` +
        `${r.heightRate.value.toFixed(1)} | ${r.travel.value.toFixed(1)} | ` +
        `${r.stateFlips} | ${r.nonFinite} | ` +
        `${r.dip.value.toFixed(2)} | ${motionPlace(r.handSpeed)} |`,
    ),
  ];
}

const motionPlace = (w: MotionWorst): string =>
  w.dancer === undefined ? "—" : `${w.dancer} ${w.side} at beat ${w.beat!.toFixed(3)}`;

const fraction = (step: number): string =>
  Number.isInteger(1 / step) ? `1/${Math.round(1 / step)}` : String(step);

/** How far a direction has to turn to count as a reversal: more than 90°. */
const REVERSAL_DOT = 0;

type Vec3 = readonly [number, number, number];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Whether every number in one trail sample is finite. */
const finiteTrail = (t: HandTrail): boolean =>
  Number.isFinite(t.hand[0]) &&
  Number.isFinite(t.hand[1]) &&
  Number.isFinite(t.handHeight) &&
  Number.isFinite(t.elbow[0]) &&
  Number.isFinite(t.elbow[1]) &&
  Number.isFinite(t.elbowHeight);

/** One hand at one step, kept so the next step can difference against it. */
interface HandTrail {
  beat: Beat;
  hand: Vec2;
  handHeight: number;
  elbow: Vec2;
  elbowHeight: number;
  hanging: boolean;
  /** Forward, to the dancer's right, and up: the hand relative to the body. */
  local: Vec3;
  direction: Vec3 | undefined;
  lastReversal: { beat: Beat; local: Vec3 } | undefined;
}

/**
 * The hand relative to the dancer: forward, to their right, and up.
 *
 * Reversals are measured here rather than on the floor so that walking across
 * the room is not a reversal and a hand that is taken, dropped and taken again
 * while the dancer walks steadily is.
 */
function bodyLocalHand(pose: PoseSample, hand: Hand): Vec3 {
  const rad = (pose.facing * Math.PI) / 180;
  const dx = hand.p[0] - pose.p[0];
  const dy = hand.p[1] - pose.p[1];
  return [
    dx * Math.cos(rad) + dy * Math.sin(rad),
    -dx * Math.sin(rad) + dy * Math.cos(rad),
    -hand.drop,
  ];
}

function statsFor(rows: Map<string, MotionStats>, key: string): MotionStats {
  const found = rows.get(key);
  if (found) return found;
  const made = emptyStats(key);
  rows.set(key, made);
  return made;
}

const emptyStats = (key: string): MotionStats => ({
  key,
  handSpeed: { value: 0 },
  elbowSpeed: { value: 0 },
  elbowPerHand: { value: 0 },
  heightRate: { value: 0 },
  travel: { value: 0 },
  elbowHeightRate: { value: 0 },
  stateFlips: 0,
  flipJump: { value: 0 },
  nonFinite: 0,
  dip: { value: 0 },
  reversals: 0,
  samples: 0,
});

function keep(
  worst: MotionWorst,
  value: number,
  where: { dancer: DancerId; beat: Beat; side?: Side },
): void {
  if (value <= worst.value) return;
  worst.value = value;
  worst.dancer = where.dancer;
  worst.beat = where.beat;
  // A body has no side, which is what the `travel` column measures.
  if (where.side === undefined) delete worst.side;
  else worst.side = where.side;
}

/** One dancer's path length so far, one entry per sampled step. */
interface BodyTrail {
  previous: Vec2;
  /** Cumulative distance travelled, in step order, starting at 0. */
  along: number[];
}

/** Extend a dancer's path trail by one step and return it. */
function bodyTrailOf(trails: Map<DancerId, BodyTrail>, dancer: DancerId, p: Vec2): BodyTrail {
  const found = trails.get(dancer);
  if (!found) {
    const made: BodyTrail = { previous: p, along: [0] };
    trails.set(dancer, made);
    return made;
  }
  const last = found.along[found.along.length - 1]!;
  found.along.push(last + dist(found.previous, p));
  found.previous = p;
  return found;
}

/** The first beat any figure in the timeline starts at. */
function firstFigureBeat(timeline: Timeline, dancers: readonly DancerId[]): Beat {
  let first = Infinity;
  for (const dancer of dancers) {
    const event = timeline.figuresOf(dancer)[0];
    if (event) first = Math.min(first, event.start);
  }
  return Number.isFinite(first) ? first : 0;
}
