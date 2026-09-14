import { createGroup, frame } from "@caller/choreo";
import { dist } from "@caller/core";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER, PLACE_PITCH_PX } from "../formation/dupleImproper.js";
import { longLines } from "./long-lines.js";
import { figureMoves, figureProblems, probeFigure, probeGroup, stationSpot } from "./testing.js";

describe("long lines", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      expect(figureProblems(probeFigure(longLines, {}, { group: probeGroup(formation) }))).toEqual(
        [],
      );
    });
  }

  it("comes back to the places it started on, facing across the set", () => {
    const ends = figureMoves(longLines);
    for (const id of ["1L", "1R", "2L", "2R"]) {
      expect(ends[id]!.p, id).toEqual(stationSpot(DUPLE_IMPROPER, id).p);
    }
    // +x line faces −x and the other faces +x, whatever they faced before.
    expect(ends["1L"]!.facing).toBeCloseTo(180, 6);
    expect(ends["1R"]!.facing).toBeCloseTo(0, 6);
  });

  it("joins hands with the next minor set's dancer, on one floor point", () => {
    // Two groups of one line, a place pitch apart down the set: the dancer at
    // the bottom of one and the dancer at the top of the next put their outside
    // hands on the same point, without either group knowing the other exists.
    const stations = DUPLE_IMPROPER.group(4);
    const build = (centre: [number, number], id: string) =>
      createGroup(
        {
          id,
          kind: "set",
          frame: frame(centre, 90),
          stations,
          members: Object.fromEntries(stations.map((s) => [s.id, `${id}/${s.id}`])),
          couples: [],
        },
        DUPLE_IMPROPER.roleSet,
      );
    const above = build([0, 0], "a");
    const below = build([0, 2 * PLACE_PITCH_PX], "b");
    const params = { from: {}, forwardPx: 9, holdDrop: 8, stackPx: 1, beats: 8 };

    for (const t of [2, 4, 6]) {
      // "2R" is the bottom of the +x line in the upper group; "1L" is the top
      // of the same line in the lower one.
      const upper = longLines.sample(above, "2R", t, params);
      const lower = longLines.sample(below, "1L", t, params);
      // Both face −x, so the hand pointing down the set — toward the other
      // group — is the upper dancer's left and the lower dancer's right.
      const outerOfUpper = upper.hands.L;
      const outerOfLower = lower.hands.R;
      if (outerOfUpper === "down" || outerOfLower === "down") throw new Error("hands are down");
      expect(dist(outerOfUpper.p, outerOfLower.p), `beat ${t}`).toBeLessThan(0.1);
    }
  });
});
