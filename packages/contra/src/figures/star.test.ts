import { describe, expect, it } from "vitest";
import type { Vec2 } from "@caller/core";
import { dist } from "@caller/core";
import { frame as makeFrame, withDefaults } from "@caller/choreo";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { WRIST_ALONG, star } from "./star.js";
import {
  figureMoves,
  figureProblems,
  probeFigure,
  probeGroup,
  spotError,
  stationSpot,
} from "./testing.js";

describe("star", () => {
  for (const formation of [DUPLE_IMPROPER, BECKET]) {
    it(`reaches, joins, ends and keeps its distance in ${formation.id}`, () => {
      const group = probeGroup(formation);
      for (const hold of ["wrist", "hands-across"] as const) {
        for (const hand of ["R", "L"] as const) {
          for (const places of [2, 3, 4]) {
            expect(
              figureProblems(probeFigure(star, { hold, hand, places }, { group }), {
                // A hands-across star holds the star hand square out to the
                // side — that is what the hold *is* — and the model lands it a
                // few degrees the wrong side of square: 6° behind the shoulder
                // line at the worst, for the length of the star. The bound
                // exists to catch an arm held *back*, and 6° is the width of
                // the hand it is measured to, so the star is allowed its own
                // length rather than the library's four beats.
                ...(hold === "hands-across" ? { heldBehind: star.beats } : {}),
              }),
              `${hold} ${hand}${places}`,
            ).toEqual([]);
          }
        }
      }
    });
  }

  it("turns a right-hand star the way a circle left goes, and a left-hand star back", () => {
    const right = figureMoves(star, { hand: "R", places: 1 });
    const left = figureMoves(star, { hand: "L", places: 1 });
    expect(spotError(right["1L"]!, stationSpot(DUPLE_IMPROPER, "2R"))).toBeLessThan(1e-9);
    expect(spotError(left["1L"]!, stationSpot(DUPLE_IMPROPER, "1R"))).toBeLessThan(1e-9);
  });

  it("hands-across brings each diagonal pair to one floor point in the middle", () => {
    // Every join this hold declares is a diagonal pair, and the probe checks
    // each of them is one point; both pairs happen to sit over the centre.
    expect(
      probeFigure(star, { hold: "hands-across" }, { group: probeGroup(DUPLE_IMPROPER) }).maxJoinGap,
    ).toBe(0);
  });

  it("wrist grip puts four hands at four points on a small ring, not one pile", () => {
    // The wrist hold declares no `HandJoin`s at all — nobody's hand is shared,
    // each one is on the *other* dancer's wrist — so this samples the hands
    // directly rather than reading the probe's join-gap oracle.
    const group = probeGroup(DUPLE_IMPROPER, 4, makeFrame([0, 0], 90));
    const resolved = withDefaults(star, {}, star.beats);
    const t = star.beats / 2;
    const points: Vec2[] = [];
    for (const id of ["1L", "1R", "2L", "2R"] as const) {
      const hand = star.sample(group, id, t, resolved).hands.R;
      if (hand === "down") throw new Error(`${id}'s R hand is down at beat ${t}`);
      // The ring's centre is the group's own centre, [0, 0] on this frame, and
      // the four grips sit on a ring about it: `WRIST_ALONG` of the way down
      // the arm of the dancer ahead, which for a four-star's 6.51 px shoulder
      // radius is `s × (1 − t) / |1 − t·i|` = 2.9100 px at `t = 0.5`
      // (`figures/star.ts`'s `wristPoint`). Well clear of the middle, and well
      // clear of anybody's shoulder.
      expect(WRIST_ALONG).toBe(0.5);
      expect(Math.hypot(hand.p[0], hand.p[1])).toBeCloseTo(2.91, 2);
      points.push(hand.p);
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(dist(points[i]!, points[j]!)).toBeGreaterThan(1);
      }
    }
  });
});
