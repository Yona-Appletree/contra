import { describe, expect, it } from "vitest";
import { placePairFor } from "./places.js";

/**
 * **The place search, and the tie the lane exposes** (M7b).
 *
 * `placePairFor` answers "which two of the formation's places does this pair
 * settle on to". Over a minor set's four places the midpoint alone decides it;
 * over a whole line's twelve it does not, because a line is symmetric about its
 * own middle, so every pair of places straddling the pair's centre has the
 * **same** midpoint and the widest of them used to win on array order. A Rare
 * Bird's six-couple N3 shoulder round is where that was measured, and the
 * numbers below are that instance's own.
 */

/** A six-couple duple improper line's home places, as the lane hands them over. */
const LINE_OF_SIX: [number, number][] = [
  [16, 0],
  [-16, 0],
  [-16, 20],
  [16, 20],
  [16, 40],
  [-16, 40],
  [-16, 60],
  [16, 60],
  [16, 80],
  [-16, 80],
  [-16, 100],
  [16, 100],
];

/** A minor set's own four places, in the order `homesOf` lists them. */
const HANDS_FOUR: [number, number][] = [
  [16, 0],
  [-16, 0],
  [-16, 20],
  [16, 20],
];

describe("placePairFor", () => {
  it("settles a lane pair on the two places it stands between, not the widest pair with the same midpoint", () => {
    // A Rare Bird at six couples: `c0/lark` at (16, 40) and `c5/robin` at
    // (16, 60) turn about (16, 50). Three pairs of places on that line share
    // that midpoint; only one of them is the pair they are standing between.
    const pair = placePairFor(LINE_OF_SIX, [16, 50], 180, 10);
    expect(pair.ends.map((p) => [...p])).toEqual([
      [16, 40],
      [16, 60],
    ]);
    expect(pair.centre).toEqual([16, 50]);
    expect(pair.half).toBe(10);
  });

  it("is the same answer at every place along the line", () => {
    for (const centre of [10, 30, 50, 70, 90]) {
      const pair = placePairFor(LINE_OF_SIX, [16, centre], 180, 10);
      expect([centre, 2 * pair.half]).toEqual([centre, 20]);
    }
  });

  it("takes the pair as far apart as the dancers themselves, not simply the narrowest", () => {
    // Two dancers standing two places apart settle two places apart: the
    // tie-break is the pair's own separation, not the smallest span going.
    const pair = placePairFor(LINE_OF_SIX, [16, 40], 180, 20);
    expect(2 * pair.half).toBe(40);
    expect(pair.ends.map((p) => [...p])).toEqual([
      [16, 20],
      [16, 60],
    ]);
  });

  it("answers the minor set exactly as it did: the two places across the set", () => {
    // A swing in a hands-four, facing along the set. Nothing here ever tied, so
    // this is the answer every dance in the programme has always had.
    const pair = placePairFor(HANDS_FOUR, [0, 0], 90, 16);
    expect(pair.half).toBe(16);
    expect(pair.centre).toEqual([0, 0]);
  });

  it("falls back to the pair's own separation when no pair of places suits", () => {
    const pair = placePairFor([], [3, 4], 0, 7);
    expect(pair.half).toBe(7);
    expect(pair.centre).toEqual([3, 4]);
  });
});
