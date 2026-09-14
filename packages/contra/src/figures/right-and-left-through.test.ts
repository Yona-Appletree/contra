import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { rightAndLeftThrough } from "./right-and-left-through.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("right and left through", () => {
  it("reaches, joins, ends and keeps its distance in becket", () => {
    expect(
      figureProblems(probeFigure(rightAndLeftThrough, {}, { group: probeGroup(BECKET) })),
    ).toEqual([]);
  });

  it("puts the couple on the other line, the robin still on the lark's right", () => {
    const ends = figureMoves(rightAndLeftThrough, {}, BECKET);
    // Couple one crosses from the `−x` line to the `+x` one and turns back.
    expect(spotError(ends["1L"]!, stationSpot(BECKET, "2L"))).toBeLessThan(1e-9);
    expect(spotError(ends["1R"]!, stationSpot(BECKET, "2R"))).toBeLessThan(1e-9);
    expect(Math.abs(((ends["1L"]!.facing % 360) + 360) % 360)).toBeCloseTo(180, 6);
  });

  it("is its own opposite: twice through leaves everybody home", () => {
    const once = figureMoves(rightAndLeftThrough, {}, BECKET);
    const twice = figureMoves(rightAndLeftThrough, { from: once }, BECKET);
    for (const id of ["1L", "1R", "2L", "2R"]) {
      expect(spotError(twice[id]!, stationSpot(BECKET, id)), id).toBeLessThan(1e-9);
    }
  });
});
