import { describe, expect, it } from "vitest";
import { dist, rightOf } from "@caller/core";
import { BECKET } from "../formation/becket.js";
import { robinsChain } from "./robins-chain.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("robins chain", () => {
  it("reaches, joins, ends and keeps its distance in becket", () => {
    expect(figureProblems(probeFigure(robinsChain, {}, { group: probeGroup(BECKET) }))).toEqual([]);
  });

  it("trades the robins and leaves the larks where they stood", () => {
    const ends = figureMoves(robinsChain, {}, BECKET);
    expect(spotError(ends["1R"]!, stationSpot(BECKET, "2R"))).toBeLessThan(1e-9);
    expect(spotError(ends["2R"]!, stationSpot(BECKET, "1R"))).toBeLessThan(1e-9);
    for (const lark of ["1L", "2L"]) {
      expect(spotError(ends[lark]!, stationSpot(BECKET, lark)), lark).toBeLessThan(1e-9);
      expect(ends[lark]!.facing, lark).toBe(stationSpot(BECKET, lark).facing);
    }
  });

  it("is its own opposite: chain over and back and everybody is home", () => {
    const over = figureMoves(robinsChain, {}, BECKET);
    const back = figureMoves(robinsChain, { from: over }, BECKET);
    for (const id of ["1L", "1R", "2L", "2R"]) {
      expect(spotError(back[id]!, stationSpot(BECKET, id)), id).toBeLessThan(1e-9);
    }
  });

  it("says so when there are not two of the chaining role", () => {
    expect(() => figureMoves(robinsChain, { chains: "nobody" }, BECKET)).toThrow(/exactly two/);
  });

  // F9's other candidate. The default is the rigid turn and everything above
  // measures it; these two pin what `stepInPx` is for, so the comparison the
  // user picks from cannot quietly rot.
  it("chains rigidly by default", () => {
    expect(robinsChain.defaults.stepInPx).toBe(0);
  });

  it("passes right shoulders and still closes exactly when the lark steps in", () => {
    for (const stepInPx of [4, 8]) {
      const ends = figureMoves(robinsChain, { stepInPx }, BECKET);
      expect(spotError(ends["2R"]!, stationSpot(BECKET, "1R")), `${stepInPx}: 2R`).toBeLessThan(
        1e-9,
      );
      expect(spotError(ends["1L"]!, stationSpot(BECKET, "1L")), `${stepInPx}: 1L`).toBeLessThan(
        1e-9,
      );

      // Which shoulder the two robins show each other at their closest, which
      // is the whole reason this candidate exists: `rightOf` her facing dotted
      // with the way to the other one is positive when she is passing right.
      const group = probeGroup(BECKET);
      const params = { ...robinsChain.defaults, stepInPx, beats: robinsChain.beats };
      let closest = { gap: Infinity, side: 0 };
      for (let t = 0; t <= 4.5; t += 1 / 32) {
        const a = robinsChain.sample(group, "1R", t, params);
        const b = robinsChain.sample(group, "2R", t, params);
        const gap = dist(a.p, b.p);
        if (gap >= closest.gap) continue;
        const r = rightOf(a.facing);
        closest = { gap, side: r[0] * (b.p[0] - a.p[0]) + r[1] * (b.p[1] - a.p[1]) };
      }
      expect(closest.side, `${stepInPx}: shoulder at ${closest.gap.toFixed(3)} px`).toBeGreaterThan(
        0,
      );
    }
  });
});
