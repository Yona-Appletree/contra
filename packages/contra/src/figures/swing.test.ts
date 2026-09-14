import { angleDiff, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { endFacingOf, swing } from "./swing.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("swing", () => {
  it("reaches, joins, ends and keeps its distance in duple improper", () => {
    const group = probeGroup(DUPLE_IMPROPER);
    expect(figureProblems(probeFigure(swing, {}, { group }))).toEqual([]);
    expect(
      figureProblems(probeFigure(swing, { pairs: "partners", endFacing: "down" }, { group })),
    ).toEqual([]);
    expect(figureProblems(probeFigure(swing, { turns: 3, beats: 16 }, { group }))).toEqual([]);
  });

  it("reaches, joins, ends and keeps its distance in becket", () => {
    const group = probeGroup(BECKET);
    expect(figureProblems(probeFigure(swing, { endFacing: "down" }, { group }))).toEqual([]);
    expect(figureProblems(probeFigure(swing, { pairs: "partners" }, { group }))).toEqual([]);
  });

  it("is the duple improper progression when it is the neighbours who swing", () => {
    // The lark ends on the left of the robin facing across, which for a pair
    // standing up and down a line is exactly where the next time through wants
    // them: everybody on the place of the neighbour they swung.
    const ends = figureMoves(swing, { pairs: "neighbors" });
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
    expect(spotError(ends["2R"]!, stationSpot(DUPLE_IMPROPER, "1L"))).toBeLessThan(1e-9);
    expect(spotError(ends["1R"]!, stationSpot(DUPLE_IMPROPER, "2L"))).toBeLessThan(1e-9);
    expect(spotError(ends["2L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
  });

  it("ends with the robin on the right of the lark, both facing where it was told", () => {
    const ends = figureMoves(swing, { pairs: "partners", endFacing: "down" });
    // Facing down the set (`+y`), the lark's right is `−x`, where the robin is.
    expect(ends["1L"]!.facing).toBe(90);
    expect(ends["1R"]!.facing).toBe(90);
    expect(ends["1R"]!.p[0]).toBeLessThan(ends["1L"]!.p[0]);
  });

  it("opens out on to the formation's places however close the pair started", () => {
    // After a balance the pair is a hold spacing apart, not a place pitch; the
    // swing still ends on the stations.
    const closed = {
      "1L": { p: [16, -7] as [number, number], facing: 90 },
      "2R": { p: [16, 7] as [number, number], facing: 270 },
      "1R": { p: [-16, -7] as [number, number], facing: 90 },
      "2L": { p: [-16, 7] as [number, number], facing: 270 },
    };
    const ends = figureMoves(swing, { pairs: "neighbors", from: closed });
    expect(dist(ends["1L"]!.p, ends["2R"]!.p)).toBeCloseTo(20, 9);
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
  });

  it("breaks an ambiguous 'across' with the way the pair is already facing", () => {
    // Partners in duple improper stand square across the set, so both ways
    // square to their line point along the hall and neither is nearer the
    // middle. F3c: the pair opens out the way it came in rather than throwing,
    // which is what a caller means by "open out". `endFacingOf` still refuses
    // when it has no facing to go on.
    const ends = figureMoves(swing, { pairs: "partners" });
    for (const id of ["1L", "1R", "2L", "2R"]) {
      const spot = stationSpot(DUPLE_IMPROPER, id);
      expect(Math.abs(angleDiff(ends[id]!.facing, spot.facing))).toBeLessThanOrEqual(90);
    }
    expect(() => endFacingOf("across", [0, -10], [0, 10], [0, 0])).toThrow(/ambiguous/);
  });
});
