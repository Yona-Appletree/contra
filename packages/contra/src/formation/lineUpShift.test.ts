import type { SetSpec } from "@caller/choreo";
import { HOLD_SPACING_PX, lineUpPlaces, lineUpShiftOf, shiftPlaces } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET, BECKET_STATIONS, becketHandsFourCalls } from "./becket.js";
import { BECKET_RIGHT } from "./becketRight.js";
import { DUPLE_IMPROPER } from "./dupleImproper.js";

/**
 * Which way a hall moves after it has taken hands four, **measured off the
 * formation's own progression** rather than written down.
 *
 * The user, B3: "if its becket, you still line up improper, but the caller will
 * say 'move one place to the left … ' … _technically_ if its a
 * right-progressing becket dance, you should move one place _to the right_ …
 * it means you progress the 'wrong' way from the direction you were facing when
 * you took hands four."
 *
 * That last sentence is the whole test. Becket is not a label here: it is a
 * formation whose progression runs **across** the way its dancers face, and the
 * side it runs to is the side the caller says.
 */
const spec = (couples: number): SetSpec => ({
  id: "s",
  couples,
  centre: [0, 0],
  axis: 90,
});

describe("the line-up shift comes off the progression", () => {
  it("is null for duple improper: you progress the way you are facing", () => {
    for (const couples of [4, 5, 6, 7, 8]) {
      expect(lineUpShiftOf(DUPLE_IMPROPER, DUPLE_IMPROPER.start(spec(couples))), `${couples}`).toBe(
        null,
      );
    }
    expect(shiftPlaces(null)).toBe(0);
  });

  it("is left for becket: you progress across the way you are facing", () => {
    for (const couples of [4, 6, 8]) {
      expect(lineUpShiftOf(BECKET, BECKET.start(spec(couples))), `${couples}`).toBe("left");
    }
    expect(shiftPlaces("left")).toBe(1);
  });

  it("is right for a right-progressing becket — the branch no demo dance has", () => {
    for (const couples of [4, 6, 8]) {
      expect(lineUpShiftOf(BECKET_RIGHT, BECKET_RIGHT.start(spec(couples))), `${couples}`).toBe(
        "right",
      );
    }
    expect(shiftPlaces("right")).toBe(-1);
  });

  it("says the direction it measured, and nothing about which formation it is", () => {
    expect(becketHandsFourCalls("left")[0]).toBe("MOVE ONE PLACE TO YOUR LEFT");
    expect(becketHandsFourCalls("right")[0]).toBe("MOVE ONE PLACE TO YOUR RIGHT");
    expect(becketHandsFourCalls("left").slice(1)).toEqual([
      "THIS IS A BECKET DANCE",
      "YOUR PARTNER IS ON THE SIDE OF THE SET WITH YOU",
    ]);
    // A formation with no shift has nothing to say about one.
    expect(becketHandsFourCalls(null)).toEqual([]);
  });

  it("is what the becket formations actually hand the decider", () => {
    const left = BECKET.start(spec(8));
    const right = BECKET_RIGHT.start(spec(8));
    expect(BECKET.handsFourCalls?.(lineUpShiftOf(BECKET, left))?.[0]).toBe(
      "MOVE ONE PLACE TO YOUR LEFT",
    );
    expect(BECKET_RIGHT.handsFourCalls?.(lineUpShiftOf(BECKET_RIGHT, right))?.[0]).toBe(
      "MOVE ONE PLACE TO YOUR RIGHT",
    );
  });
});

/**
 * "You still line up improper", made literal.
 *
 * A becket hall does not walk into becket places. It walks into a duple
 * improper line — partners **across** the set, larks and robins alternating
 * down each line — takes hands four, and the ring moves one place round. That
 * one place is what turns an improper line into a becket one, and it is the
 * only difference between the two formations' line-ups.
 */
describe("a becket hall lines up improper and is shifted into becket", () => {
  const byId = (id: string) => BECKET_STATIONS.find((s) => s.id === id)!;
  const lineUp = lineUpPlaces(BECKET_STATIONS, shiftPlaces("left"), HOLD_SPACING_PX);

  it("stands with each partner across the set, not beside them", () => {
    // In becket, partners (1L/1R, 2L/2R) stand on the *same* line: same x.
    expect(byId("1L").p[0]).toBe(byId("1R").p[0]);
    expect(byId("2L").p[0]).toBe(byId("2R").p[0]);
    // In the line-up they are across from each other: same y, opposite x.
    expect(lineUp["1L"]!.p[1]).toBe(lineUp["1R"]!.p[1]);
    expect(lineUp["1L"]!.p[0]).toBe(-lineUp["1R"]!.p[0]);
    expect(lineUp["2L"]!.p[1]).toBe(lineUp["2R"]!.p[1]);
    expect(lineUp["2L"]!.p[0]).toBe(-lineUp["2R"]!.p[0]);
  });

  it("puts a lark and a robin alternately down each line, which is what improper means", () => {
    const line = (x: number) =>
      BECKET_STATIONS.filter((s) => lineUp[s.id]!.p[0] === x)
        .sort((a, b) => lineUp[a.id]!.p[1] - lineUp[b.id]!.p[1])
        .map((s) => s.role);
    for (const x of [-16, 16]) {
      const roles = line(x);
      expect(roles, `the line at x=${String(x)}`).toHaveLength(2);
      expect(roles[0], `the line at x=${String(x)}`).not.toBe(roles[1]);
    }
  });

  it("stands on the same four spots the dance uses, in a different order", () => {
    const spots = new Set(BECKET_STATIONS.map((s) => `${String(s.p[0])},${String(s.p[1])}`));
    for (const s of BECKET_STATIONS) {
      const q = lineUp[s.id]!;
      expect(spots.has(`${String(q.p[0])},${String(q.p[1])}`), s.id).toBe(true);
      expect(q.p, s.id).not.toEqual(s.p);
    }
  });
});
