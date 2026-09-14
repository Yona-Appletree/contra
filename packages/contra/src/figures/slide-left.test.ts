import { describe, expect, it } from "vitest";
import { BECKET, COUPLE_PITCH_PX } from "../formation/becket.js";
import { slideLeft } from "./slide-left.js";
import { figureMoves, figureProblems, probeFigure, probeGroup, stationSpot } from "./testing.js";

describe("slide left", () => {
  it("reaches, ends and keeps its distance in becket", () => {
    expect(figureProblems(probeFigure(slideLeft, {}, { group: probeGroup(BECKET) }))).toEqual([]);
  });

  it("slides every dancer one couple place to their own left, still facing across", () => {
    const ends = figureMoves(slideLeft, {}, BECKET);
    // The `+1` line faces `+x`, so its own left is `−y`; the other line's is `+y`.
    for (const id of ["1L", "1R"]) {
      const from = stationSpot(BECKET, id);
      expect(ends[id]!.p[0], id).toBeCloseTo(from.p[0], 9);
      expect(ends[id]!.p[1], id).toBeCloseTo(from.p[1] - COUPLE_PITCH_PX, 9);
      expect(ends[id]!.facing, id).toBe(from.facing);
    }
    for (const id of ["2L", "2R"]) {
      const from = stationSpot(BECKET, id);
      expect(ends[id]!.p[1], id).toBeCloseTo(from.p[1] + COUPLE_PITCH_PX, 9);
    }
  });
});
