import type { Beat, DancerId, PoseSample, Timeline } from "@caller/choreo";
import {
  ORACLE_STEP,
  closureReport,
  collisionReport,
  coverageProblems,
  poseAt,
  reachReport,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES } from "../dances/index.js";
import { danceAlone, linesFor, threadsOnTheOldPath } from "../dances/oracle.js";
import { legacyCyclePlanner } from "./planCycle.js";

/**
 * **AC1**: the ten demo dances, danced through the contra cycle planner with
 * the legacy bridge, are **pose-identical** to the same dances danced through
 * the decider's own planner.
 *
 * This is the milestone. The new path throws away `chainCalls` — no
 * `params.from` threaded at load time, no `carried` by array adjacency — and
 * rebuilds both from set state, per set, per call, against the group each call
 * actually resolves into. If that reproduces today's geometry to floating-point
 * noise, then the hub is a faithful generalisation of what the two old places
 * were doing; if it does not, the hub is wrong. **A diff here is a bug in the
 * hub, not a tolerance to raise** (`plan.md` §"Validation strategy").
 *
 * Compared, for every demo dance, at every line length its formation is checked
 * at, over two times through, for every dancer, at every 1/8 beat:
 *
 * - position (px), facing (degrees), look, lean, `stepRate`, `buzz`, `flare`,
 *   `amp`, and both hands — the placed ones as points and drops, and which
 *   hands are placed at all;
 * - the three oracle reports (closure, reach, collision), including which
 *   dancer, beat and figure was the worst of each;
 * - `coverageProblems`, which must be empty for both.
 */

/**
 * The planner with **every** figure bridged, which is what AC1 is about.
 *
 * M2 migrated five figures to data, and the contra planner's own default
 * library now resolves those five against their definitions rather than their
 * bridges — which changes what they dance, on purpose (the honest end). AC1 is
 * the hub's golden, not the gatherers': it asks whether resolution against set
 * state reproduces `chainCalls` when the figures are the same figures. So this
 * test names the all-bridged library explicitly, and keeps meaning exactly what
 * it meant in M1 for as long as any coded figure is left.
 */
const BRIDGED = legacyCyclePlanner;

/** The director's own number for AC1: 1e-9 px, 1e-9°, hands identical. */
const TOLERANCE = 1e-9;

/** Two times through, which is what every other dance check uses. */
const UNTIL: Beat = 128;

/**
 * The demo dances the **old path can dance at all**, which is what AC1 compares.
 *
 * `chainCalls` threads a dance by handing each figure the four stations of a
 * hands-four and asking where it leaves people, and a figure that takes a
 * **pair** cannot answer that — `anchor: "meet"` is minted one instance per
 * pair by resolution and refuses four roles by name. M6 recorded this when it
 * wrote the first such figure ("the old path cannot dance such a dance at all,
 * which is honest"); M5 is where a **demo** dance calls one, because On the
 * Prowl's shoulder round is a figure for two with no coded twin.
 *
 * So AC1 compares the dances both paths can dance, and the list of what it
 * leaves out is asserted below by name rather than filtered quietly. What AC1
 * claims is unchanged: where the two paths can both dance a dance, they dance it
 * pose for pose.
 */
const COMPARABLE = DEMO_DANCES.filter(threadsOnTheOldPath);

describe("AC1: the demo dances through the contra planner are pose-identical", () => {
  it("compares every demo dance but the three the old path cannot thread", () => {
    // On the Prowl's shoulder round (M5), The Nice Combination's turn as
    // couples and Chorus Jig's lead, cast and turn alone (M7): every one of
    // them is a figure minted per pair or per dancer with no coded twin, which
    // is exactly the question `threadsOnTheOldPath` asks.
    expect(
      DEMO_DANCES.map((d) => d.slug)
        .filter((s) => !COMPARABLE.some((d) => d.slug === s))
        .sort(),
    ).toEqual(["chorus-jig", "on-the-prowl", "the-nice-combination"]);
    expect(COMPARABLE).toHaveLength(10);
  });

  for (const dance of COMPARABLE) {
    for (const couples of linesFor(dance)) {
      it(`${dance.slug} at ${String(couples)} couples`, () => {
        const old = danceAlone(dance, couples, UNTIL).timeline();
        const now = danceAlone(dance, couples, UNTIL, {}, { cycle: BRIDGED }).timeline();

        // The same dancers, found in the same order: `timeline.dancers()` is
        // insertion-ordered, and the oracle reports below break their ties by
        // it, so this is part of the claim and not a detail.
        expect(now.dancers()).toEqual(old.dancers());

        const worst = comparePoses(old, now, UNTIL);
        expect(worst.hands).toEqual([]);
        expect(worst.positionPx).toBeLessThan(TOLERANCE);
        expect(worst.facingDeg).toBeLessThan(TOLERANCE);
        expect(worst.scalar).toBeLessThan(TOLERANCE);
        expect(worst.handPx).toBeLessThan(TOLERANCE);

        expect(coverageProblems(now, 0, UNTIL)).toEqual([]);
        expect(coverageProblems(old, 0, UNTIL)).toEqual([]);

        expectClose(closureReport(now), closureReport(old));
        expectClose(reachReport(now, 0, UNTIL), reachReport(old, 0, UNTIL));
        expectClose(collisionReport(now, 0, UNTIL), collisionReport(old, 0, UNTIL));
      });
    }
  }
});

/** The worst difference of any kind between two timelines' poses. */
interface Worst {
  positionPx: number;
  facingDeg: number;
  /** Look, lean, step rate, flare and amp, whose units are their own. */
  scalar: number;
  handPx: number;
  /** Every place the two disagreed about *whether* a hand was placed at all. */
  hands: string[];
}

function comparePoses(old: Timeline, now: Timeline, until: Beat): Worst {
  const worst: Worst = { positionPx: 0, facingDeg: 0, scalar: 0, handPx: 0, hands: [] };
  const steps = Math.round(until / ORACLE_STEP);
  for (const dancer of old.dancers()) {
    for (let i = 0; i <= steps; i++) {
      const beat = i * ORACLE_STEP;
      compare(worst, dancer, beat, poseAt(old, dancer, beat), poseAt(now, dancer, beat));
    }
  }
  return worst;
}

function compare(worst: Worst, dancer: DancerId, beat: Beat, a: PoseSample, b: PoseSample): void {
  worst.positionPx = Math.max(
    worst.positionPx,
    Math.abs(a.p[0] - b.p[0]),
    Math.abs(a.p[1] - b.p[1]),
  );
  worst.facingDeg = Math.max(worst.facingDeg, Math.abs(a.facing - b.facing));
  worst.scalar = Math.max(
    worst.scalar,
    Math.abs(a.look - b.look),
    Math.abs(a.lean - b.lean),
    Math.abs(a.stepRate - b.stepRate),
    Math.abs(a.flare - b.flare),
    Math.abs(a.amp - b.amp),
  );
  if (a.buzz !== b.buzz) worst.hands.push(`${dancer} at ${String(beat)}: buzz`);
  for (const side of ["L", "R"] as const) {
    const ha = a.hands[side];
    const hb = b.hands[side];
    if (ha === "down" || hb === "down") {
      if (ha !== hb) worst.hands.push(`${dancer} at ${String(beat)}: ${side} hand placed/down`);
      continue;
    }
    worst.handPx = Math.max(
      worst.handPx,
      Math.abs(ha.p[0] - hb.p[0]),
      Math.abs(ha.p[1] - hb.p[1]),
      Math.abs(ha.drop - hb.drop),
    );
  }
  if (a.feet === undefined || b.feet === undefined) {
    if ((a.feet === undefined) !== (b.feet === undefined)) {
      worst.hands.push(`${dancer} at ${String(beat)}: feet placed/absent`);
    }
    return;
  }
  for (const side of ["L", "R"] as const) {
    worst.handPx = Math.max(
      worst.handPx,
      Math.abs(a.feet[side][0] - b.feet[side][0]),
      Math.abs(a.feet[side][1] - b.feet[side][1]),
    );
  }
}

/** Two oracle reports, equal in every number to the tolerance and in every name exactly. */
function expectClose(nowReport: object, oldReport: object): void {
  const now = nowReport as Record<string, unknown>;
  const old = oldReport as Record<string, unknown>;
  expect(Object.keys(now).sort()).toEqual(Object.keys(old).sort());
  for (const [key, value] of Object.entries(now)) {
    const other = old[key];
    if (typeof value === "number" && typeof other === "number") {
      expect(Math.abs(value - other), `${key}: ${String(value)} vs ${String(other)}`).toBeLessThan(
        TOLERANCE,
      );
      continue;
    }
    if (
      value !== null &&
      other !== null &&
      typeof value === "object" &&
      typeof other === "object"
    ) {
      expectClose(value, other);
      continue;
    }
    expect(value, key).toEqual(other);
  }
}
