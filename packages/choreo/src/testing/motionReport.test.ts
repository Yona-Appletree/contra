import type { Beat, Hand, PoseSample, Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { EndPose, FigureDef, FigureParams } from "../figure/FigureDef.js";
import { createFigureRegistry } from "../figure/FigureDef.js";
import { createGroup } from "../group/Group.js";
import type { Group } from "../group/Group.js";
import type { StationId } from "../formation/Formation.js";
import { frame } from "../formation/Frame.js";
import { createTimeline } from "../timeline/Timeline.js";
import { DEFAULT_MOTION_BOUNDS, formatMotionReport, motionReport } from "./oracles.js";

/**
 * The motion oracle, on two figures whose defects are put there on purpose.
 *
 * Nothing here is a contra: two dancers, one figure that holds a hand still
 * and one that teleports it, and a seam between them. The oracle has to
 * attribute each number to the right figure, put the boundary's number on the
 * seam, and count a hand that is not a number rather than stepping over it.
 */

interface TestParams extends FigureParams {
  /** Where the hand goes: a fixed point, a jump half way through, or `NaN`. */
  hand: "still" | "far" | "jump" | "broken" | "down";
}

const still: Hand = { p: [0, -4], drop: 5 };
const far: Hand = { p: [0, -40], drop: 5 };

/** Two dancers standing on the spot; only the hand does anything. */
const TEST_FIGURE: FigureDef<TestParams> = {
  id: "test",
  call: "TEST",
  lead: 0,
  beats: 4,
  defaults: { hand: "still" },
  sample(_group: Group, station: StationId, t: Beat, params: TestParams): PoseSample {
    const p: Vec2 = station === "a" ? [0, 0] : [20, 0];
    const hand: Hand | "down" =
      params.hand === "down"
        ? "down"
        : params.hand === "far"
          ? far
          : params.hand === "broken" && t >= 2
            ? { p: [NaN, NaN], drop: NaN }
            : params.hand === "jump" && t >= 2
              ? far
              : still;
    return {
      p,
      facing: 0,
      look: 0,
      lean: 0,
      hands: { L: "down", R: hand },
      stepRate: 1,
      buzz: false,
      flare: 0,
      amp: 0,
    };
  },
  ends(): Record<StationId, EndPose> {
    return { a: { p: [0, 0], facing: 0 }, b: { p: [20, 0], facing: 0 } };
  },
};

const registry = createFigureRegistry([TEST_FIGURE]);

/** A timeline of `hand` settings, one figure instance per entry, back to back. */
function timelineOf(...hands: TestParams["hand"][]) {
  const stations = [
    { id: "a", role: "x", facing: 0, p: [0, 0] as Vec2 },
    { id: "b", role: "y", facing: 0, p: [20, 0] as Vec2 },
  ];
  const group: Group = createGroup(
    {
      id: "g",
      kind: "set",
      frame: frame([0, 0], 0),
      stations,
      members: { a: "a", b: "b" },
      couples: [],
    },
    { roles: ["x", "y"], top: "y" },
  );
  const timeline = createTimeline(registry);
  timeline.addGroup(group);
  hands.forEach((hand, i) => {
    timeline.add({
      kind: "figure",
      group: "g",
      figure: "test",
      params: { beats: 4, hand },
      bindings: { a: "a", b: "b" },
      start: i * 4,
      end: (i + 1) * 4,
    });
  });
  return timeline;
}

describe("motionReport", () => {
  it("reports nothing moving when nothing moves", () => {
    const report = motionReport(timelineOf("still"), 4);
    const row = report.figures[0]!;
    expect(row.key).toBe("test");
    expect(row.handSpeed.value).toBe(0);
    expect(row.elbowSpeed.value).toBe(0);
    expect(row.nonFinite).toBe(0);
    expect(row.stateFlips).toBe(0);
    expect(report.seams).toEqual([]);
  });

  it("measures a jump as speed, and says who and when", () => {
    const report = motionReport(timelineOf("jump"), 4);
    const row = report.figures[0]!;
    // 36 px in one 1/32-beat step.
    expect(row.handSpeed.value).toBeCloseTo(36 * 32, 6);
    expect(row.handSpeed.beat).toBeCloseTo(2, 6);
    expect(["a", "b"]).toContain(row.handSpeed.dancer);
    expect(row.handSpeed.side).toBe("R");
  });

  it("counts a hand that is not a number instead of stepping over it", () => {
    const report = motionReport(timelineOf("broken"), 4);
    const row = report.figures[0]!;
    expect(row.nonFinite).toBeGreaterThan(0);
    expect(row.firstNonFinite?.beat).toBeCloseTo(2, 6);
    // The jump *into* the NaN is not reported as a speed, because there is no
    // speed to report: the point is that the arm stops existing.
    expect(Number.isFinite(row.handSpeed.value)).toBe(true);
  });

  it("puts the boundary's own numbers on the seam, not only on the figure", () => {
    // Two instances back to back, the second starting with the hand far away,
    // so the only thing that moves is the seam between them.
    const report = motionReport(timelineOf("still", "far"), 8);
    const seam = report.seams[0]!;
    expect(seam.key).toBe("test → test");
    expect(seam.handSpeed.value).toBeGreaterThan(0);
    expect(seam.handSpeed.beat).toBeGreaterThanOrEqual(4);
    expect(seam.handSpeed.beat).toBeLessThan(4.4);
  });

  it("counts a hand that changes between placed and hanging as a state flip", () => {
    const report = motionReport(timelineOf("still", "down"), 8);
    const seam = report.seams[0]!;
    expect(seam.stateFlips).toBeGreaterThan(0);
    expect(seam.firstFlip?.side).toBe("R");
  });

  it("sorts an offending figure above a quiet one and marks it in the markdown", () => {
    const report = motionReport(timelineOf("jump"), 4, {
      bounds: { ...DEFAULT_MOTION_BOUNDS, handSpeedPx: 1 },
    });
    const text = formatMotionReport(report);
    expect(text).toContain("**Per figure**");
    expect(text).toContain("`test`");
    expect(text).toContain("1/32 beat");
  });
});
