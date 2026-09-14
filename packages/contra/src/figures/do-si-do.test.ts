import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { doSiDo } from "./do-si-do.js";
import { figureMoves, figureProblems, probeFigure, probeGroup, stationSpot } from "./testing.js";

describe("do-si-do", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      for (const amount of [1, 1.5]) {
        for (const pairs of ["neighbors", "partners"] as const) {
          expect(
            figureProblems(probeFigure(doSiDo, { amount, pairs }, { group })),
            `${amount} ${pairs}`,
          ).toEqual([]);
        }
      }
    });
  }

  it("never turns a body: the head does the looking", () => {
    const group = probeGroup(DUPLE_IMPROPER);
    const params = {
      from: {},
      pairs: "neighbors" as const,
      amount: 1,
      swellPx: 2.5,
      endHalf: null,
      beats: 8,
    };
    const start = doSiDo.sample(group, "1L", 0, params);
    for (const t of [2, 4, 6, 8]) {
      expect(doSiDo.sample(group, "1L", t, params).facing, `beat ${t}`).toBeCloseTo(
        start.facing,
        9,
      );
    }
  });

  it("comes home once round and changes places once and a half", () => {
    const once = figureMoves(doSiDo, { amount: 1 });
    expect(once["1L"]!.p[0]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "1L").p[0], 9);
    const half = figureMoves(doSiDo, { amount: 1.5 });
    expect(half["1L"]!.p[0]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "2R").p[0], 9);
    expect(half["1L"]!.p[1]).toBeCloseTo(stationSpot(DUPLE_IMPROPER, "2R").p[1], 9);
  });
});
