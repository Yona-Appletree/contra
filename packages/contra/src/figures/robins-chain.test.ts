import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { robinsChain } from "./robins-chain.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("robins chain", () => {
  it("reaches, joins, ends and keeps its distance in becket", () => {
    expect(figureProblems(probeFigure(robinsChain, {}, { group: probeGroup(BECKET) }))).toEqual([]);
  });

  it("trades the robins and leaves the larks where they stood", () => {
    const ends = figureMoves(robinsChain, {}, BECKET);
    expect(spotError(ends["1R"]!, stationSpot(BECKET, "2R"))).toBeLessThan(1e-9);
    expect(spotError(ends["2R"]!, stationSpot(BECKET, "1R"))).toBeLessThan(1e-9);
    for (const lark of ["1L", "2L"]) {
      expect(spotError(ends[lark]!, stationSpot(BECKET, lark)), lark).toBeLessThan(1e-9);
      expect(ends[lark]!.facing, lark).toBe(stationSpot(BECKET, lark).facing);
    }
  });

  it("is its own opposite: chain over and back and everybody is home", () => {
    const over = figureMoves(robinsChain, {}, BECKET);
    const back = figureMoves(robinsChain, { from: over }, BECKET);
    for (const id of ["1L", "1R", "2L", "2R"]) {
      expect(spotError(back[id]!, stationSpot(BECKET, id)), id).toBeLessThan(1e-9);
    }
  });

  it("says so when there are not two of the chaining role", () => {
    expect(() => figureMoves(robinsChain, { chains: "nobody" }, BECKET)).toThrow(/exactly two/);
  });
});
