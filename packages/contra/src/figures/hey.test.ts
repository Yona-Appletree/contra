import { frame } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { hey } from "./hey.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

/** The hey read in frame-local px: a group on the identity frame. */
const plainGroup = probeGroup(DUPLE_IMPROPER, 4, frame([0, 0], 90));

const params = (start: "robins-right" | "larks-left") => ({
  from: {},
  start,
  half: false,
  trackPx: 5,
  joinBeats: 2,
  beats: 16,
});

describe("hey for four", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      expect(figureProblems(probeFigure(hey, {}, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(hey, { half: true, beats: 8 }, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(hey, { start: "larks-left" }, { group }))).toEqual([]);
    });
  }

  it("comes home after a whole hey", () => {
    const ends = figureMoves(hey);
    for (const id of ["1L", "1R", "2L", "2R"]) {
      expect(spotError(ends[id]!, stationSpot(DUPLE_IMPROPER, id)), id).toBeLessThan(1e-9);
    }
  });

  it("changes sides after half a hey: each dancer takes the place opposite", () => {
    const ends = figureMoves(hey, { half: true, beats: 8 });
    expect(spotError(ends["1R"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
    expect(spotError(ends["2R"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "2L"))).toBeLessThan(1e-9);
  });

  it("sends the robins into the middle first and the larks round the ends", () => {
    const across = (station: string, t: number): number =>
      hey.sample(plainGroup, station, t, params("robins-right")).p[0];
    expect(Math.abs(across("1R", 3))).toBeLessThan(6);
    expect(Math.abs(across("2R", 3))).toBeLessThan(6);
    expect(Math.abs(across("1L", 3))).toBeGreaterThan(12);
    expect(Math.abs(across("2L", 3))).toBeGreaterThan(12);
  });

  it("mirrors the weave when the larks start", () => {
    const across = (station: string, t: number): number =>
      hey.sample(plainGroup, station, t, params("larks-left")).p[0];
    expect(Math.abs(across("1L", 3))).toBeLessThan(6);
    expect(Math.abs(across("1R", 3))).toBeGreaterThan(12);
  });

  it("passes the two in the middle on opposite sides of it", () => {
    // The lane's two sides are `trackPx` either side of the middle, so the two
    // dancers crossing at the same moment are twice that apart.
    const at = (station: string, t: number): number =>
      hey.sample(plainGroup, station, t, params("robins-right")).p[1];
    expect(Math.abs(at("1R", 4) - at("2R", 4))).toBeCloseTo(10, 6);
  });
});
