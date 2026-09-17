import type { Vec2 } from "@caller/core";
import { describe, expect, it } from "vitest";
import type { StationId } from "../formation/Formation.js";
import type { EndPose } from "./FigureDef.js";
import type { RingPlaces } from "./ring.js";
import { RING_NEIGHBOR_SPACING_PX, ringEnd, ringOf, ringShift } from "./ring.js";

/**
 * Four places on the corners of a rectangle — the shape a minor set of any form
 * stands in, and the one the ring geometry is written for. Nothing here is
 * contra: they are four ids, four points and four facings.
 */
const CORNERS: RingPlaces = {
  a: { p: [16, 40], facing: 180 },
  b: { p: [-16, 40], facing: 0 },
  c: { p: [-16, 20], facing: 0 },
  d: { p: [16, 20], facing: 180 },
};

const IDS: StationId[] = ["a", "b", "c", "d"];
const ring = ringOf(CORNERS, IDS, RING_NEIGHBOR_SPACING_PX);
const at = (id: StationId): EndPose => CORNERS[id]!;
const end = (station: StationId, places: number): Vec2 => ringEnd(ring, CORNERS, station, places);

describe("ringShift", () => {
  it("counts places round the ring the way its order runs", () => {
    expect(ring.order).toEqual(["a", "b", "c", "d"]);
    expect(ringShift(ring, "a", 1)).toBe("b");
    expect(ringShift(ring, "a", -1)).toBe("d");
    expect(ringShift(ring, "a", 4)).toBe("a");
    expect(ringShift(ring, "a", -4)).toBe("a");
  });

  /**
   * The asymmetry {@link ringShift}'s own doc comment names, pinned so that it
   * cannot be "fixed" by accident: `Math.round` rounds a half **up**, so a ring
   * turned back half a place lands one place nearer home than the same ring
   * turned forward. Exactly one call in the corpus is affected and its whole
   * downstream is calibrated on this answer.
   */
  it("rounds a half place up, not away from zero", () => {
    expect(ringShift(ring, "a", 3.5)).toBe(ringShift(ring, "a", 4));
    expect(ringShift(ring, "a", -3.5)).toBe(ringShift(ring, "a", -3));
  });
});

describe("ringEnd", () => {
  it("is the place itself for a whole number of places, to the bit", () => {
    for (const station of IDS) {
      for (const places of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
        expect(end(station, places)).toEqual(at(ringShift(ring, station, places)).p);
      }
    }
  });

  it("is that far along the last run for a fraction of a place", () => {
    // Three places back from `a` is `b`; the run that carries on from there is
    // the one to `a`'s own place, and half of it is the point between them.
    expect(end("a", -3)).toEqual([-16, 40]);
    expect(end("a", -4)).toEqual([16, 40]);
    expect(end("a", -3.5)).toEqual([0, 40]);
    expect(end("a", -3.25)).toEqual([-8, 40]);
    expect(end("a", -0.5)).toEqual([16, 30]);
  });

  /**
   * **A ring turned back is the same ring turned forward in a mirror**, which
   * the end keeps even where {@link ringShift} does not: reflect the four places
   * and the ring runs the other way round, so a walk of `−places` in one is the
   * reflection of a walk of `+places` in the other — half places included.
   */
  it("mirrors: turning back is turning forward, reflected", () => {
    // `+ 0` so that a reflected zero is `0` and not `-0`, which `toEqual` tells
    // apart and no dancer does.
    const flip = (p: Vec2): Vec2 => [-p[0] + 0, p[1]];
    const mirrored: RingPlaces = {};
    for (const id of IDS) mirrored[id] = { p: flip(at(id).p), facing: 180 - at(id).facing };
    const other = ringOf(mirrored, IDS, RING_NEIGHBOR_SPACING_PX);
    for (const station of IDS) {
      for (const places of [0.5, 1, 2, 3, 3.25, 3.5, 3.75, 4]) {
        expect(ringEnd(other, mirrored, station, places)).toEqual(
          flip(ringEnd(ring, CORNERS, station, -places)),
        );
      }
    }
  });

  it("is float-crumb proof: a places × amount product still reads as whole", () => {
    // What a star's `places: 4, amount: 0.75` really hands in.
    expect(end("a", -(4 * 0.75))).toEqual(at("b").p);
    expect(end("a", -(3 * (1 / 3)))).toEqual(at("d").p);
  });
});
