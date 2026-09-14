import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { balanceRing } from "./balance.js";
import { petronella } from "./petronella.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("petronella", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, ends and keeps its distance in ${formation.id}`, () => {
      expect(figureProblems(probeFigure(petronella, {}, { group: probeGroup(formation) }))).toEqual(
        [],
      );
    });
  }

  it("moves everybody one place to their own right, facing the middle", () => {
    // One place to the right is one place back round the ring, which runs the
    // way a circle left travels.
    const ends = figureMoves(petronella);
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    expect(spotError(ends["1R"]!, stationSpot(DUPLE_IMPROPER, "2L"))).toBeLessThan(1e-9);
    for (const spot of Object.values(ends)) {
      const toMiddle = (Math.atan2(-spot.p[1], -spot.p[0]) * 180) / Math.PI;
      const off = (((spot.facing - toMiddle) % 360) + 540) % 360;
      expect(off).toBeCloseTo(180, 6);
    }
  });

  it("follows a balance of the ring on to the ring, not back to the stations", () => {
    const ring = figureMoves(balanceRing);
    const after = figureMoves(petronella, { from: ring });
    expect(after["1L"]!.p[0]).toBeCloseTo(ring["1R"]!.p[0], 9);
    expect(after["1L"]!.p[1]).toBeCloseTo(ring["1R"]!.p[1], 9);
  });
});
