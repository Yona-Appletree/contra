import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { rollAway } from "./roll-away.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("roll away", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      expect(figureProblems(probeFigure(rollAway, {}, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(rollAway, { beats: 2 }, { group }))).toEqual([]);
    });
  }

  it("trades the couple's places and leaves both facing the way they were", () => {
    const ends = figureMoves(rollAway, { pairs: "partners" });
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    expect(ends["1L"]!.facing).toBe(stationSpot(DUPLE_IMPROPER, "1L").facing);
    expect(ends["1R"]!.facing).toBe(stationSpot(DUPLE_IMPROPER, "1R").facing);
  });

  it("rolls the robin and slides the lark", () => {
    const group = probeGroup(DUPLE_IMPROPER);
    const params = {
      from: {},
      pairs: "partners" as const,
      roller: "robin",
      bowPx: 4.5,
      spins: 1,
      holdDrop: 6,
      beats: 4,
    };
    const lark = rollAway.sample(group, "1L", 2, params);
    const robin = rollAway.sample(group, "1R", 2, params);
    expect(robin.flare).toBeGreaterThan(0);
    expect(lark.flare).toBe(0);
  });
});
