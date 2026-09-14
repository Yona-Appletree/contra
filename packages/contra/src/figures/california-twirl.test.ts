import { dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { californiaTwirl } from "./california-twirl.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("california twirl", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      expect(figureProblems(probeFigure(californiaTwirl, {}, { group }))).toEqual([]);
    });
  }

  it("trades the couple's places and turns both of them round", () => {
    const ends = figureMoves(californiaTwirl, { pairs: "partners" });
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    expect(spotError(ends["1R"]!, stationSpot(DUPLE_IMPROPER, "1L"))).toBeLessThan(1e-9);
    expect(ends["1L"]!.facing).toBe(stationSpot(DUPLE_IMPROPER, "1L").facing + 180);
    expect(ends["1R"]!.facing).toBe(stationSpot(DUPLE_IMPROPER, "1R").facing + 180);
  });

  it("says so when the pair is not standing side by side", () => {
    // In duple improper the neighbours face each other along the line, so they
    // have no inside hands to raise; a twirl is for a couple side by side.
    expect(() => figureMoves(californiaTwirl, { pairs: "neighbors" })).toThrow(/side by side/);
  });

  it("keeps the couple the same distance apart the whole way round", () => {
    const group = probeGroup(DUPLE_IMPROPER);
    const params = { from: {}, pairs: "partners" as const, holdDrop: 0, beats: 4 };
    for (const t of [0, 1, 2, 3, 4]) {
      const a = californiaTwirl.sample(group, "1L", t, params);
      const b = californiaTwirl.sample(group, "1R", t, params);
      expect(dist(a.p, b.p), `beat ${t}`).toBeCloseTo(32, 6);
    }
  });
});
