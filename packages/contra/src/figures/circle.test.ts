import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { circle } from "./circle.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("circle", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      expect(figureProblems(probeFigure(circle, {}, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(circle, { places: 4 }, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(circle, { direction: "right" }, { group }))).toEqual([]);
    });
  }

  it("leaves everybody three places round for a circle left three quarters", () => {
    // The ring runs anticlockwise on the floor, which is the way a circle left
    // travels: 1L, 2R, 2L, 1R in duple improper.
    const ends = figureMoves(circle, { places: 3 });
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    expect(spotError(ends["2R"]!, stationSpot(DUPLE_IMPROPER, "1L"))).toBeLessThan(1e-9);
    expect(spotError(ends["2L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
    expect(spotError(ends["1R"]!, stationSpot(DUPLE_IMPROPER, "2L"))).toBeLessThan(1e-9);
  });

  it("goes the other way round to the right, and all the way round is home", () => {
    const right = figureMoves(circle, { places: 1, direction: "right" });
    expect(spotError(right["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    const home = figureMoves(circle, { places: 4 });
    for (const id of ["1L", "1R", "2L", "2R"]) {
      expect(home[id]!.p, id).toEqual(stationSpot(DUPLE_IMPROPER, id).p);
    }
  });

  it("makes a ring whose neighbours are exactly a hold spacing apart", () => {
    // Mid figure everybody is on the ring: four dancers, hold spacing apart.
    const group = probeGroup(DUPLE_IMPROPER);
    const probe = probeFigure(circle, {}, { group });
    expect(probe.minDistance).toBeCloseTo(group.frame.spacing, 6);
  });
});
