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
    for (const direction of [1, -1] as const) {
      const params = { from: {}, pairs: "partners" as const, holdDrop: 0, direction, beats: 4 };
      for (const t of [0, 1, 2, 3, 4]) {
        const a = californiaTwirl.sample(group, "1L", t, params);
        const b = californiaTwirl.sample(group, "1R", t, params);
        expect(dist(a.p, b.p), `beat ${t} direction ${direction}`).toBeCloseTo(32, 6);
      }
    }
  });

  it("reaches, joins, ends and keeps its distance turning the other way too", () => {
    for (const formation of [DUPLE_IMPROPER, BECKET]) {
      const group = probeGroup(formation);
      expect(
        figureProblems(probeFigure(californiaTwirl, { direction: -1 }, { group })),
        formation.id,
      ).toEqual([]);
    }
  });

  it("ends on the same two places whichever way it turns, by the other arc", () => {
    const group = probeGroup(DUPLE_IMPROPER);
    const base = { from: {}, pairs: "partners" as const, holdDrop: 0, beats: 4 };
    // Same places...
    const forwards = figureMoves(californiaTwirl, { pairs: "partners", direction: 1 });
    const backwards = figureMoves(californiaTwirl, { pairs: "partners", direction: -1 });
    for (const id of ["1L", "1R"]) {
      expect(dist(forwards[id]!.p, backwards[id]!.p), id).toBeLessThan(1e-9);
    }
    // ...by arcs on opposite sides of the pair's centre.
    const half = 2;
    const a = californiaTwirl.sample(group, "1L", half, { ...base, direction: 1 });
    const b = californiaTwirl.sample(group, "1L", half, { ...base, direction: -1 });
    expect(dist(a.p, b.p)).toBeGreaterThan(30);
  });
});
