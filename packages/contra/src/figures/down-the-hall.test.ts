import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { downTheHall } from "./down-the-hall.js";
import { figureMoves, figureProblems, probeFigure, probeGroup } from "./testing.js";

describe("down the hall", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      expect(
        figureProblems(probeFigure(downTheHall, {}, { group: probeGroup(formation) })),
      ).toEqual([]);
    });
  }

  it("swaps each couple's own two dancers onto each other's original station", () => {
    const ends = figureMoves(downTheHall);
    // 1L ends where 1R started, and 1R ends where 1L started; same for 2.
    for (const [a, b] of [
      ["1L", "1R"],
      ["1R", "1L"],
      ["2L", "2R"],
      ["2R", "2L"],
    ] as const) {
      const originalOfB = DUPLE_IMPROPER.group(4).find((s) => s.id === b)!;
      expect(ends[a]!.p).toEqual(originalOfB.p);
      expect(ends[a]!.facing).toBeCloseTo(originalOfB.facing, 6);
    }
  });

  it("honors a dance-authored order (couple 2 leads the line)", () => {
    const ends = figureMoves(downTheHall, { order: ["2L", "2R", "1L", "1R"] });
    // Couple pairing (adjacent in `order`) is unchanged; only which couple
    // leads the line changed, which does not change who ends on whom.
    const originalOf2R = DUPLE_IMPROPER.group(4).find((s) => s.id === "2R")!;
    expect(ends["2L"]!.p).toEqual(originalOf2R.p);
  });
});
