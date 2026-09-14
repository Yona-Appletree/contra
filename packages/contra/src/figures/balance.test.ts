import { HOLD_SPACING_PX, dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { balance, balanceRing } from "./balance.js";
import { figureMoves, figureProblems, probeFigure, probeGroup } from "./testing.js";

describe("balance", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      for (const pairs of ["neighbors", "partners"] as const) {
        for (const hold of ["two", "one", "none"] as const) {
          expect(
            figureProblems(probeFigure(balance, { pairs, hold }, { group })),
            `${pairs} ${hold}`,
          ).toEqual([]);
        }
      }
      expect(figureProblems(probeFigure(balanceRing, {}, { group }))).toEqual([]);
    });
  }

  it("closes the pair to the frame's hold spacing, which is where a swing starts", () => {
    for (const pairs of ["neighbors", "partners"] as const) {
      const ends = figureMoves(balance, { pairs });
      expect(dist(ends["1L"]!.p, ends[pairs === "neighbors" ? "2R" : "1R"]!.p)).toBeCloseTo(
        HOLD_SPACING_PX,
        9,
      );
    }
  });

  it("leaves the pair facing each other", () => {
    const ends = figureMoves(balance, { pairs: "neighbors" });
    expect(Math.abs(((ends["1L"]!.facing - ends["2R"]!.facing) % 360) + 360) % 360).toBeCloseTo(
      180,
      6,
    );
  });

  it("rocks the ring in and out and leaves everybody on it", () => {
    const ends = figureMoves(balanceRing);
    const centre = [0, 0];
    const radii = Object.values(ends).map((spot) => dist(spot.p, centre as [number, number]));
    for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 9);
    // Four dancers on a ring with neighbours a hold spacing apart.
    expect(radii[0]!).toBeCloseTo(HOLD_SPACING_PX / Math.SQRT2, 9);
  });
});
