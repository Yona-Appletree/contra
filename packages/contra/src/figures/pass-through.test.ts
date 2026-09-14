import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { passThrough } from "./pass-through.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("pass through", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    for (const direction of ["across", "along"] as const) {
      it(`reaches, ends and keeps its distance ${direction} in ${formation.id}`, () => {
        expect(
          figureProblems(probeFigure(passThrough, { direction }, { group: probeGroup(formation) })),
        ).toEqual([]);
      });
    }
  }

  it("swaps with the dancer across the set", () => {
    const ends = figureMoves(passThrough, { direction: "across" });
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    expect(spotError(ends["2L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
  });

  it("swaps with the dancer up or down the line", () => {
    const ends = figureMoves(passThrough, { direction: "along" });
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
    expect(spotError(ends["1R"]!, stationSpot(DUPLE_IMPROPER, "2L"))).toBeLessThan(1e-9);
  });

  it("passes right shoulders, which is to each dancer's own left", () => {
    // Both bow the same way round the crossing, so the two of them end up
    // `2 × bow` apart with their right shoulders together.
    const probe = probeFigure(passThrough, {}, { group: probeGroup(DUPLE_IMPROPER) });
    expect(probe.minDistance).toBeCloseTo(10, 6);
  });
});
