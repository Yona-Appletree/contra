import { describe, expect, it } from "vitest";
import type { Seat } from "./formations.js";
import {
  COUPLE_PITCH_PX,
  LINE_X_PX,
  PLACE_PITCH_PX,
  dancerId,
  roleOfId,
  seating,
} from "./formations.js";

/** Where everybody stands, as a dancer would read it off the floor. */
const places = (formation: "becket" | "duple-improper", couples: number) =>
  Object.fromEntries(
    seating(formation, couples).seats.map((seat) => [seat.id, { p: seat.p, facing: seat.facing }]),
  );

const slots = (formation: "becket" | "duple-improper", couples: number) =>
  Object.fromEntries(
    seating(formation, couples).seats.map((seat) => [
      seat.id,
      { line: seat.line, position: seat.position, travel: seat.travel },
    ]),
  );

describe("becket", () => {
  it("stands the first hands four where Butter's record does", () => {
    // `data/dances/butter.json`'s own `startPlaces`, verbatim: a becket dance
    // whose first figure is a shift begins half a couple place back along its
    // own line, which is where this formation begins.
    expect(places("becket", 2)).toEqual({
      "1L": { p: [-16, 10], facing: 0 },
      "1R": { p: [-16, 30], facing: 0 },
      "2L": { p: [16, -10], facing: 180 },
      "2R": { p: [16, -30], facing: 180 },
    });
  });

  it("stands one couple on its own line, with nobody across", () => {
    expect(places("becket", 1)).toEqual({
      "1L": { p: [-16, 10], facing: 0 },
      "1R": { p: [-16, 30], facing: 0 },
    });
  });

  it("lays the second hands four one couple place further down the hall", () => {
    expect(places("becket", 4)).toEqual({
      "1L": { p: [-16, 10], facing: 0 },
      "1R": { p: [-16, 30], facing: 0 },
      "2L": { p: [16, -10], facing: 180 },
      "2R": { p: [16, -30], facing: 180 },
      "3L": { p: [-16, 50], facing: 0 },
      "3R": { p: [-16, 70], facing: 0 },
      "4L": { p: [16, 30], facing: 180 },
      "4R": { p: [16, 10], facing: 180 },
    });
  });

  it("lays the third one further again", () => {
    expect(places("becket", 6)).toEqual({
      "1L": { p: [-16, 10], facing: 0 },
      "1R": { p: [-16, 30], facing: 0 },
      "2L": { p: [16, -10], facing: 180 },
      "2R": { p: [16, -30], facing: 180 },
      "3L": { p: [-16, 50], facing: 0 },
      "3R": { p: [-16, 70], facing: 0 },
      "4L": { p: [16, 30], facing: 180 },
      "4R": { p: [16, 10], facing: 180 },
      "5L": { p: [-16, 90], facing: 0 },
      "5R": { p: [-16, 110], facing: 0 },
      "6L": { p: [16, 70], facing: 180 },
      "6R": { p: [16, 50], facing: 180 },
    });
  });

  it("puts the odd couples on the −x line going up the hall, the even ones the other way", () => {
    expect(slots("becket", 4)).toEqual({
      "1L": { line: 0, position: 1, travel: 1 },
      "1R": { line: 0, position: 2, travel: 1 },
      "2L": { line: 1, position: 0, travel: -1 },
      "2R": { line: 1, position: -1, travel: -1 },
      "3L": { line: 0, position: 3, travel: 1 },
      "3R": { line: 0, position: 4, travel: 1 },
      "4L": { line: 1, position: 2, travel: -1 },
      "4R": { line: 1, position: 1, travel: -1 },
    });
  });

  it("stands the robin on the lark's right, which is the other way on each line", () => {
    const set = seating("becket", 2);
    const right = (seat: Seat): number => (seat.facing + 90) % 360;
    const seat = (id: string): Seat => {
      const found = set.seatOf(id);
      if (found === undefined) throw new Error(`no ${id}`);
      return found;
    };
    // A dancer's right is `facing + 90°`, and the two lines face opposite ways.
    expect(right(seat("1L"))).toBe(90);
    expect(seat("1R").p[1] - seat("1L").p[1]).toBe(PLACE_PITCH_PX);
    expect(right(seat("2L"))).toBe(270);
    expect(seat("2R").p[1] - seat("2L").p[1]).toBe(-PLACE_PITCH_PX);
  });

  it("keeps the lines 32 px apart and the couples on a line 40 px", () => {
    const set = seating("becket", 4);
    const y = (id: string): number => set.seats.find((s) => s.id === id)?.p[1] ?? NaN;
    const x = (id: string): number => set.seats.find((s) => s.id === id)?.p[0] ?? NaN;
    expect(x("1L")).toBe(-LINE_X_PX);
    expect(x("2L")).toBe(LINE_X_PX);
    expect(y("3L") - y("1L")).toBe(COUPLE_PITCH_PX);
    expect(y("4L") - y("2L")).toBe(COUPLE_PITCH_PX);
  });
});

describe("duple improper", () => {
  it("stands one couple across the set, facing down the hall", () => {
    expect(places("duple-improper", 1)).toEqual({
      "1L": { p: [16, 0], facing: 90 },
      "1R": { p: [-16, 0], facing: 90 },
    });
  });

  it("faces the twos up the hall, with the larks alternating down each line", () => {
    expect(places("duple-improper", 2)).toEqual({
      "1L": { p: [16, 0], facing: 90 },
      "1R": { p: [-16, 0], facing: 90 },
      "2L": { p: [-16, 20], facing: 270 },
      "2R": { p: [16, 20], facing: 270 },
    });
  });

  it("lays further couples one place down the hall each", () => {
    expect(places("duple-improper", 3)).toEqual({
      "1L": { p: [16, 0], facing: 90 },
      "1R": { p: [-16, 0], facing: 90 },
      "2L": { p: [-16, 20], facing: 270 },
      "2R": { p: [16, 20], facing: 270 },
      "3L": { p: [16, 40], facing: 90 },
      "3R": { p: [-16, 40], facing: 90 },
    });
  });

  it("gives every couple one place and both lines", () => {
    expect(slots("duple-improper", 3)).toEqual({
      "1L": { line: 1, position: 0, travel: 1 },
      "1R": { line: 0, position: 0, travel: 1 },
      "2L": { line: 0, position: 1, travel: -1 },
      "2R": { line: 1, position: 1, travel: -1 },
      "3L": { line: 1, position: 2, travel: 1 },
      "3R": { line: 0, position: 2, travel: 1 },
    });
  });
});

describe("the seating", () => {
  it("names dancers by couple and role, and reads the role back off the id", () => {
    expect(dancerId(1, "lark")).toBe("1L");
    expect(dancerId(12, "robin")).toBe("12R");
    expect(roleOfId("1L")).toBe("lark");
    expect(roleOfId("12R")).toBe("robin");
  });

  it("lists everybody couple by couple, lark first", () => {
    expect(seating("becket", 3).seats.map((seat) => seat.id)).toEqual([
      "1L",
      "1R",
      "2L",
      "2R",
      "3L",
      "3R",
    ]);
    expect(seating("duple-improper", 3).seats.map((seat) => seat.role)).toEqual([
      "lark",
      "robin",
      "lark",
      "robin",
      "lark",
      "robin",
    ]);
  });

  it("answers nobody for a slot off the end of a line", () => {
    const set = seating("becket", 2);
    expect(set.at({ line: 0, position: 1 })).toBe("1L");
    expect(set.at({ line: 0, position: 9 })).toBeUndefined();
    expect(set.seatOf("9L")).toBeUndefined();
  });

  it("refuses a set that is not a whole number of couples", () => {
    expect(() => seating("becket", 0)).toThrow(/whole number of couples/);
    expect(() => seating("duple-improper", 2.5)).toThrow(/whole number of couples/);
  });
});
