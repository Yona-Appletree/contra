import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { star } from "./star.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("star", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      for (const hand of ["R", "L"] as const) {
        for (const places of [2, 3, 4]) {
          expect(
            figureProblems(probeFigure(star, { hand, places }, { group })),
            `${hand}${places}`,
          ).toEqual([]);
        }
      }
    });
  }

  it("turns a right-hand star the way a circle left goes, and a left-hand star back", () => {
    const right = figureMoves(star, { hand: "R", places: 1 });
    const left = figureMoves(star, { hand: "L", places: 1 });
    expect(spotError(right["1L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
    expect(spotError(left["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
  });

  it("brings every hand to one floor point in the middle", () => {
    // Every join the figure declares is the two hands across the star, and the
    // probe checks each of them is one point; all four therefore coincide.
    expect(probeFigure(star, {}, { group: probeGroup(DUPLE_IMPROPER) }).maxJoinGap).toBe(0);
  });
});
