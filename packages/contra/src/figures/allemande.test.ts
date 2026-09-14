import { dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { allemande } from "./allemande.js";
import { figureMoves, figureProblems, probeFigure, probeGroup, stationSpot } from "./testing.js";

describe("allemande", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      for (const hand of ["L", "R"] as const) {
        for (const amount of [1, 1.5, 2]) {
          for (const pairs of ["neighbors", "partners"] as const) {
            expect(
              figureProblems(probeFigure(allemande, { hand, amount, pairs }, { group })),
              `${hand} ${amount} ${pairs}`,
            ).toEqual([]);
          }
        }
      }
    });
  }

  it("comes home after a whole turn and changes places after a turn and a half", () => {
    const once = figureMoves(allemande, { amount: 1 });
    expect(once["1L"]!.p[0]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "1L").p[0], 9);
    expect(once["1L"]!.p[1]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "1L").p[1], 9);
    const half = figureMoves(allemande, { amount: 1.5 });
    expect(half["1L"]!.p[0]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "2R").p[0], 9);
    expect(half["1L"]!.p[1]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "2R").p[1], 9);
  });

  it("turns the other way when the other hand is given", () => {
    const left = figureMoves(allemande, { hand: "L", amount: 0.25 });
    const right = figureMoves(allemande, { hand: "R", amount: 0.25 });
    expect(dist(left["1L"]!.p, right["1L"]!.p)).toBeGreaterThan(1);
  });

  it("leaves the pair facing each other", () => {
    const ends = figureMoves(allemande, { amount: 1 });
    const gap = (((ends["1L"]!.facing - ends["2R"]!.facing) % 360) + 360) % 360;
    expect(gap).toBeCloseTo(180, 6);
  });
});
