import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER, PLACE_PITCH_PX } from "../formation/dupleImproper.js";
import { circle } from "./circle.js";
import { RING_FOOTPRINT_MARGIN_PX } from "./ring.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("circle", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      expect(figureProblems(probeFigure(circle, {}, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(circle, { places: 4 }, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(circle, { direction: "right" }, { group }))).toEqual([]);
    });
  }

  it("leaves everybody three places round for a circle left three quarters", () => {
    // The ring runs anticlockwise on the floor, which is the way a circle left
    // travels: 1L, 2R, 2L, 1R in duple improper.
    const ends = figureMoves(circle, { places: 3 });
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    expect(spotError(ends["2R"]!, stationSpot(DUPLE_IMPROPER, "1L"))).toBeLessThan(1e-9);
    expect(spotError(ends["2L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
    expect(spotError(ends["1R"]!, stationSpot(DUPLE_IMPROPER, "2L"))).toBeLessThan(1e-9);
  });

  it("goes the other way round to the right, and all the way round is home", () => {
    const right = figureMoves(circle, { places: 1, direction: "right" });
    expect(spotError(right["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    const home = figureMoves(circle, { places: 4 });
    for (const id of ["1L", "1R", "2L", "2R"]) {
      expect(home[id]!.p, id).toEqual(stationSpot(DUPLE_IMPROPER, id).p);
    }
  });

  it("makes a ring the footprint clamp caps, not the couple spacing", () => {
    // F11: neighbours are no longer the couple spacing apart — the ring's
    // *natural* radius (arm-based, RING_NEIGHBOR_SPACING_PX) is bigger than
    // this rectangle's narrower half-extent, so the footprint clamp binds: a
    // duple-improper minor set is 32×20 px, whose along-the-hall half-extent
    // is PLACE_PITCH_PX / 2 = 10 px, so the ring is capped at
    // 10 + RING_FOOTPRINT_MARGIN_PX = 12 px, and neighbours end up
    // 2 · 12 · sin(π/4) ≈ 16.971 px apart.
    const group = probeGroup(DUPLE_IMPROPER);
    const probe = probeFigure(circle, {}, { group });
    const clampedRadius = PLACE_PITCH_PX / 2 + RING_FOOTPRINT_MARGIN_PX;
    expect(probe.minDistance).toBeCloseTo(2 * clampedRadius * Math.sin(Math.PI / 4), 6);
  });
});
