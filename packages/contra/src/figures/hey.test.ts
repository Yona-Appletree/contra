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

const WEAVE_PX = 6.5;

const params = (start: "robins-right" | "larks-left") => ({
  from: {},
  start,
  half: false,
  weavePx: WEAVE_PX,
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
    // Count 2 is the first pass in the centre: the robins are on the middle of
    // the weave and the larks are out past the lines, looping.
    const across = (station: string, t: number): number =>
      hey.sample(plainGroup, station, t, params("robins-right")).p[0];
    expect(Math.abs(across("1R", 2))).toBeLessThan(1e-9);
    expect(Math.abs(across("2R", 2))).toBeLessThan(1e-9);
    expect(Math.abs(across("1L", 2))).toBeGreaterThan(16);
    expect(Math.abs(across("2L", 2))).toBeGreaterThan(16);
  });

  it("mirrors the weave when the larks start", () => {
    const across = (station: string, t: number): number =>
      hey.sample(plainGroup, station, t, params("larks-left")).p[0];
    expect(Math.abs(across("1L", 2))).toBeLessThan(1e-9);
    expect(Math.abs(across("1R", 2))).toBeGreaterThan(16);
  });

  it("passes the two in the middle on opposite sides of it", () => {
    // The weave's side-step is at its full swing where it crosses the middle,
    // so the two dancers crossing at the same moment are twice that apart —
    // and on opposite sides, which is what makes it a pass and not a collision.
    const at = (station: string, t: number): number =>
      hey.sample(plainGroup, station, t, params("robins-right")).p[1];
    expect(at("1R", 2)).toBeCloseTo(-WEAVE_PX, 6);
    expect(at("2R", 2)).toBeCloseTo(WEAVE_PX, 6);
  });

  it("weaves: the side-step swings right across between the middle and the end", () => {
    // Count 2 is a pass in the centre and count 4 a pass at the side, and the
    // dancer has changed sides of the weave in between. That is the alternation
    // — right shoulders in the middle, left at the sides — in one assertion.
    const side = (t: number): number =>
      hey.sample(plainGroup, "1R", t, params("robins-right")).p[1];
    expect(side(2)).toBeLessThan(-WEAVE_PX + 1e-9);
    expect(side(4)).toBeGreaterThan(0);
  });
});
