import { describe, expect, it } from "vitest";
import { angleDiff } from "@caller/core";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { bearing } from "./ContraFigure.js";
import { rollAway } from "./roll-away.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("roll away", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      expect(figureProblems(probeFigure(rollAway, {}, { group }))).toEqual([]);
      expect(figureProblems(probeFigure(rollAway, { beats: 2 }, { group }))).toEqual([]);
    });
  }

  it("trades the couple's places and leaves both facing the way they were", () => {
    const ends = figureMoves(rollAway, { pairs: "partners" });
    expect(spotError(ends["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
    expect(ends["1L"]!.facing).toBe(stationSpot(DUPLE_IMPROPER, "1L").facing);
    expect(ends["1R"]!.facing).toBe(stationSpot(DUPLE_IMPROPER, "1R").facing);
  });

  it("rolls the robin and slides the lark", () => {
    const group = probeGroup(DUPLE_IMPROPER);
    const params = {
      from: {},
      pairs: "partners" as const,
      roller: "robin",
      bowPx: 4.5,
      spins: 1,
      holdDrop: 6,
      beats: 4,
    };
    const lark = rollAway.sample(group, "1L", 2, params);
    const robin = rollAway.sample(group, "1R", 2, params);
    expect(robin.flare).toBeGreaterThan(0);
    expect(lark.flare).toBe(0);
  });

  it("turns the roller toward the partner, and the sign follows the side rather than the role", () => {
    const group = probeGroup(DUPLE_IMPROPER);
    const base = { from: {}, pairs: "partners" as const, bowPx: 4.5, spins: 1, holdDrop: 6 };

    // The robin rolls by default and stands to the lark's right — so the lark
    // is on the robin's own *left*, and turning to face her is anticlockwise
    // seen from above, which this coordinate system reads as facing
    // *decreasing* (`Angle.ts`: 0° toward +x, 90° toward +y, so increasing is
    // clockwise). A dance that rolled the other way with this sign a constant
    // +1 is exactly the bug the user reported: the roller turning away from
    // her partner instead of toward him.
    const robinParams = { ...base, roller: "robin" as const, beats: 4 };
    const robinStart = rollAway.sample(group, "1R", 0, robinParams);
    const robinEnd = rollAway.sample(group, "1R", 4, robinParams);
    expect(robinEnd.facing - robinStart.facing).toBeCloseTo(-360, 6);

    // Swap who rolls: the lark now crosses in front, and *she* stands to the
    // robin's left, so which side the partner is on — and therefore which way
    // "toward" turns — is mirrored too. A sign hard-coded to one role would
    // get this half wrong; reading it off the actual standing side (as
    // `roll-away.ts`'s `turnSign` does) does not.
    const larkParams = { ...base, roller: "lark" as const, beats: 4 };
    const larkStart = rollAway.sample(group, "1L", 0, larkParams);
    const larkEnd = rollAway.sample(group, "1L", 4, larkParams);
    expect(larkEnd.facing - larkStart.facing).toBeCloseTo(360, 6);
  });

  it("faces the partner partway through the roll", () => {
    // A facing-sequence check, per the brief: somewhere during the figure —
    // not only by coincidence at one of the ends — the roller's facing lines
    // up with the direction to where the partner actually is at that same
    // instant. This is the assertion that would have caught the reported bug
    // (the wrong-sign roller never faces the partner at all, since she turns
    // away from him the whole way round) and will catch a regression of it.
    const group = probeGroup(DUPLE_IMPROPER);
    const params = {
      from: {},
      pairs: "partners" as const,
      roller: "robin" as const,
      bowPx: 4.5,
      spins: 1,
      holdDrop: 6,
      beats: 4,
    };
    const steps = 512;
    let closest = Infinity;
    let closestT = 0;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * params.beats;
      const roller = rollAway.sample(group, "1R", t, params);
      const partner = rollAway.sample(group, "1L", t, params);
      const toward = bearing(roller.p, partner.p);
      const gap = Math.abs(angleDiff(roller.facing, toward));
      if (gap < closest) {
        closest = gap;
        closestT = t;
      }
    }
    // Measured at the fix: the closest approach is 0.0068°, at beat 2.855 of
    // 4 — well inside the figure, not merely at a boundary where any facing
    // could look right by accident.
    expect(closest).toBeLessThan(1);
    expect(closestT).toBeGreaterThan(params.beats * 0.25);
    expect(closestT).toBeLessThan(params.beats * 0.9);
  });
});
