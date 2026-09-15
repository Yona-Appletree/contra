import { HOLD_SPACING_PX, angleDiff, dist } from "@caller/core";
import type { Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { ShapeSpot, TargetShape } from "./shape.js";
import {
  placesOf,
  ringRadius,
  shapeMiss,
  shapePlaces,
  solveShape,
  turnsToTarget,
} from "./shape.js";

/**
 * **The target-shape solver** (Q6), on its own.
 *
 * Pure geometry, so it is tested as pure geometry: points in, points out. What
 * every case below is really asking is the one question the solver exists to
 * answer — *the caller named a shape and not an amount; where does that leave
 * four dancers who are standing here?* — and the invariant underneath all of
 * them is that the shape lands **where the dancers already are**: same centroid,
 * nothing rotated that the call did not rotate.
 */

/** Four dancers in a row across the hall, facing down it, as a line of four. */
const LINE_OF_FOUR: ShapeSpot[] = [
  { p: [21, 0], facing: 90 },
  { p: [7, 0], facing: 90 },
  { p: [-7, 0], facing: 90 },
  { p: [-21, 0], facing: 90 },
];

/** The four stations of a duple improper minor set, as a set in lines. */
const IN_LINES: ShapeSpot[] = [
  { p: [16, -10], facing: 90 },
  { p: [16, 10], facing: 270 },
  { p: [-16, 10], facing: 270 },
  { p: [-16, -10], facing: 90 },
];

const centroidOf = (spots: readonly ShapeSpot[]): Vec2 => [
  spots.reduce((n, s) => n + s.p[0], 0) / spots.length,
  spots.reduce((n, s) => n + s.p[1], 0) / spots.length,
];

describe("a shape's own places", () => {
  it("lays a line of four out in its order, evenly spaced across its axis", () => {
    const places = placesOf("line-of-four", {
      order: ["a", "b", "c", "d"],
      centre: [0, 0],
      // The order runs from +x to −x: how a caller reads a line from one side
      // of the hall, which is why `axis` is not the same thing as `facing`.
      axis: 180,
      facing: 90,
      spacing: 14,
    });
    expect(places[0]![0]).toBeCloseTo(21, 9);
    expect(places[1]![0]).toBeCloseTo(7, 9);
    expect(places[2]![0]).toBeCloseTo(-7, 9);
    expect(places[3]![0]).toBeCloseTo(-21, 9);
    for (const p of places) expect(p[1]).toBeCloseTo(0, 9);
  });

  it("puts a ring's places one spacing apart, whatever the count", () => {
    for (const n of [3, 4, 6, 8]) {
      const order = Array.from({ length: n }, (_, i) => `r${String(i)}`);
      const places = placesOf("ring", {
        order,
        centre: [5, -3],
        axis: 17,
        facing: 0,
        spacing: HOLD_SPACING_PX,
      });
      for (let i = 0; i < n; i++) {
        expect(dist(places[i]!, places[(i + 1) % n]!), `${String(n)} round`).toBeCloseTo(
          HOLD_SPACING_PX,
          9,
        );
        expect(dist(places[i]!, [5, -3])).toBeCloseTo(ringRadius(n, HOLD_SPACING_PX), 9);
      }
    }
  });

  it("names a diamond's two points and two sides apart", () => {
    const group = {
      order: ["p1", "s1", "p2", "s2"],
      centre: [0, 0] as Vec2,
      axis: 90,
      facing: 90,
      spacing: 12,
    };
    const named = shapePlaces("diamond", group);
    expect(named["point"]).toHaveLength(2);
    expect(named["side"]).toHaveLength(2);
    // The points sit along the axis (down the hall, 90°) and the sides across.
    expect(named["point"]![0]![1]).toBeCloseTo(12, 9);
    expect(named["point"]![1]![1]).toBeCloseTo(-12, 9);
    expect(Math.abs(named["side"]![0]![0])).toBeCloseTo(12, 9);
  });

  it("names a line's two ends and its two insides", () => {
    const named = shapePlaces("line-of-four", {
      order: ["a", "b", "c", "d"],
      centre: [0, 0],
      axis: 180,
      facing: 90,
      spacing: 14,
    });
    expect(named["end"]!.map((p) => p[0])).toEqual([21, -21]);
    expect(named["inside"]!.map((p) => p[0])).toEqual([7, -7]);
    expect(named["centroid"]).toEqual([[0, 0]]);
  });

  it("gives a set in lines no places of its own", () => {
    expect(
      shapePlaces("lines", { order: ["a"], centre: [0, 0], axis: 0, facing: 0, spacing: 14 }),
    ).toEqual({});
  });
});

describe("solving a target shape from where the dancers are", () => {
  it("bends a line of four into a ring about its own middle", () => {
    const solved = solveShape({ shape: "ring" }, LINE_OF_FOUR);
    expect(solved.centre[0]).toBeCloseTo(0, 9);
    expect(solved.centre[1]).toBeCloseTo(0, 9);
    // Adjacent in the line stay adjacent round the ring: that is what bending a
    // line *is*, and it is why the solver never reorders anybody.
    for (let i = 0; i < 4; i++) {
      expect(dist(solved.spots[i]!.p, solved.spots[(i + 1) % 4]!.p)).toBeCloseTo(
        HOLD_SPACING_PX,
        9,
      );
    }
    // Everybody in a ring faces its middle.
    for (const spot of solved.spots) {
      const toCentre = Math.atan2(-spot.p[1], -spot.p[0]) * (180 / Math.PI);
      expect(Math.abs(angleDiff(spot.facing, toCentre))).toBeLessThan(1e-9);
    }
  });

  it("straightens four nearly-in-a-row dancers into a wave, alternating", () => {
    const rough: ShapeSpot[] = [
      { p: [20, 1], facing: 0 },
      { p: [6, -2], facing: 180 },
      { p: [-8, 1.5], facing: 0 },
      { p: [-22, -1], facing: 180 },
    ];
    const solved = solveShape({ shape: "wave", facing: 0 }, rough);
    expect(solved.spots.map((s) => ((s.facing % 360) + 360) % 360)).toEqual([0, 180, 0, 180]);
    // In a row, evenly spaced, centred where they already were — and **as far
    // apart as they already were**, which is the same rule as the axis and the
    // facing: a target shape imposes an arrangement and moves the group nowhere.
    // A long wave down the set stands a dancing place apart and must not close
    // up to a hold spacing because nobody said not to.
    const centre = centroidOf(rough);
    expect(solved.centre[0]).toBeCloseTo(centre[0], 9);
    expect(solved.centre[1]).toBeCloseTo(centre[1], 9);
    let gaps = 0;
    for (let i = 0; i + 1 < rough.length; i++) gaps += dist(rough[i]!.p, rough[i + 1]!.p);
    const mean = gaps / (rough.length - 1);
    for (let i = 0; i < 3; i++) {
      expect(dist(solved.spots[i]!.p, solved.spots[i + 1]!.p)).toBeCloseTo(mean, 9);
    }
  });

  it("takes the spacing the call gives it over the one they are standing at", () => {
    const wide: ShapeSpot[] = [
      { p: [0, 0], facing: 0 },
      { p: [0, 20], facing: 180 },
      { p: [0, 40], facing: 0 },
      { p: [0, 60], facing: 180 },
    ];
    const solved = solveShape({ shape: "wave", facing: 0, spacing: HOLD_SPACING_PX }, wide);
    for (let i = 0; i < 3; i++) {
      expect(dist(solved.spots[i]!.p, solved.spots[i + 1]!.p)).toBeCloseTo(HOLD_SPACING_PX, 9);
    }
    // And with nothing said, a long wave keeps its dancing-place pitch.
    const kept = solveShape({ shape: "wave", facing: 0 }, wide);
    for (let i = 0; i < 3; i++) {
      expect(dist(kept.spots[i]!.p, kept.spots[i + 1]!.p)).toBeCloseTo(20, 9);
    }
  });

  it("`lead: -1` turns the wave the other way round", () => {
    const solved = solveShape({ shape: "wave", facing: 0, lead: -1 }, LINE_OF_FOUR);
    expect(solved.spots.map((s) => ((s.facing % 360) + 360) % 360)).toEqual([0, 180, 0, 180]);
    const other = solveShape({ shape: "wave", facing: 180, lead: 1 }, LINE_OF_FOUR);
    expect(other.spots.map((s) => ((s.facing % 360) + 360) % 360)).toEqual([180, 0, 180, 0]);
  });

  it("keeps a set in lines exactly where it is", () => {
    const solved = solveShape({ shape: "lines" }, IN_LINES);
    expect(solved.spots).toEqual(IN_LINES);
  });

  it("reads the axis off the dancers when the call does not give one", () => {
    // A line strung out along the hall rather than across it: the solver has to
    // follow the dancers, not a convention.
    const alongTheHall: ShapeSpot[] = [
      { p: [0, -21], facing: 0 },
      { p: [0, -7], facing: 0 },
      { p: [0, 7], facing: 0 },
      { p: [0, 21], facing: 0 },
    ];
    const solved = solveShape({ shape: "line-of-four" }, alongTheHall);
    expect(Math.abs(angleDiff(solved.axis, 90))).toBeLessThan(1e-9);
    for (const spot of solved.spots) expect(spot.p[0]).toBeCloseTo(0, 9);
  });
});

describe("the amount, solved from the shape (Q6)", () => {
  const centre: Vec2 = [0, 0];

  it("answers a half turn, a quarter and three quarters", () => {
    expect(turnsToTarget([10, 0], [-10, 0], centre)).toBeCloseTo(0.5, 9);
    expect(turnsToTarget([10, 0], [0, 10], centre, 1, 0.25)).toBeCloseTo(0.25, 9);
    expect(turnsToTarget([10, 0], [0, -10], centre, 1, 0.25)).toBeCloseTo(0.75, 9);
  });

  it("goes the way the sign says, so a left turn is not a short right one", () => {
    expect(turnsToTarget([10, 0], [0, 10], centre, -1, 0.25)).toBeCloseTo(0.75, 9);
  });

  it("rounds on to the grid a caller calls in", () => {
    // 100° round is not a contra amount; a quarter turn is.
    const to: Vec2 = [10 * Math.cos((100 * Math.PI) / 180), 10 * Math.sin((100 * Math.PI) / 180)];
    expect(turnsToTarget([10, 0], to, centre, 1, 0.25)).toBeCloseTo(0.25, 9);
  });
});

describe("how far off a stated shape the dancers really are", () => {
  it("is nothing at all when they are standing in it", () => {
    const ring: TargetShape = { shape: "ring" };
    const solved = solveShape(ring, LINE_OF_FOUR);
    expect(shapeMiss(ring, solved.spots)).toBeLessThan(1e-9);
  });

  it("measures the gap when they are in a different shape", () => {
    // Four dancers in the lines, told they formed a wave of four: the miss is
    // real and is what `pnpm dance` warns on.
    expect(shapeMiss({ shape: "wave", facing: 0 }, IN_LINES)).toBeGreaterThan(1);
  });
});
