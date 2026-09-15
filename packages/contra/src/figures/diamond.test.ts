import { createGroup } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { diamond } from "./diamond.js";
import { figureMoves, figureProblems, probeFigure, PROBE_FRAME } from "./testing.js";

/**
 * A wave of four: two centres facing along the set, two points facing
 * across it, at hold-spacing distances round a small diamond — the
 * precondition `diamond` reads from `from` rather than assuming stations.
 */
const waveOfFour = () => {
  const stations = DUPLE_IMPROPER.group(4);
  const members = Object.fromEntries(stations.map((s) => [s.id, `d/${s.id}`]));
  return createGroup(
    { id: "wave", kind: "set", frame: PROBE_FRAME, stations, members, couples: [] },
    DUPLE_IMPROPER.roleSet,
  );
};

/** The diamond's own four vertex poses: two points, two centres, 10 px out. */
const DIAMOND_FROM = {
  "1L": { p: [0, -10] as const, facing: 90 }, // top centre, faces along
  "1R": { p: [10, 0] as const, facing: 180 }, // right point, faces across
  "2L": { p: [0, 10] as const, facing: 270 }, // bottom centre, faces along
  "2R": { p: [-10, 0] as const, facing: 0 }, // left point, faces across
};

describe("diamond", () => {
  it("reaches, joins, ends and keeps its distance from a wave of four", () => {
    const probe = probeFigure(diamond, { from: DIAMOND_FROM }, { group: waveOfFour() });
    expect(figureProblems(probe)).toEqual([]);
  });

  it("swaps each pair of its own kind: points with points, centres with centres", () => {
    const ends = figureMoves(diamond, { from: DIAMOND_FROM });
    // 1L (top centre) and 2L (bottom centre) trade places; facing is exact.
    expect(ends["1L"]!.p).toEqual(DIAMOND_FROM["2L"].p);
    expect(ends["2L"]!.p).toEqual(DIAMOND_FROM["1L"].p);
    expect(ends["1L"]!.facing).toBeCloseTo(DIAMOND_FROM["2L"].facing, 6);
    // 1R (right point) and 2R (left point) trade places.
    expect(ends["1R"]!.p).toEqual(DIAMOND_FROM["2R"].p);
    expect(ends["2R"]!.p).toEqual(DIAMOND_FROM["1R"].p);
    expect(ends["1R"]!.facing).toBeCloseTo(DIAMOND_FROM["2R"].facing, 6);
  });
});
