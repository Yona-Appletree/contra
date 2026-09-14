import { HOLD_SPACING_PX, LINE_OFFSET_PX } from "@caller/core";
import { describe, expect, it } from "vitest";
import {
  COUPLE_PITCH_PX,
  FLOOR_TAIL_PX,
  LINES_APART_PX,
  SET_PITCH,
  SIDE_W,
  layoutHall,
} from "./layoutHall.js";

/**
 * The hall is a fixed world sized by the number of lines, so these are the
 * sizes and set centres a one-, two- and three-line hall has to keep having.
 * Everything is in world coordinates, origin at the centre of the world.
 */
describe("layoutHall", () => {
  it("sizes a one-line hall and centres its set", () => {
    const hall = layoutHall({ lines: 1, couplesPerLine: [4] });
    expect(hall.world).toEqual({ w: 164, h: 262, zoom: 1 });
    expect(hall.sets).toHaveLength(1);
    expect(hall.sets[0]?.cx).toBe(0);
    expect(hall.sets[0]?.top).toBe(-20);
    expect(hall.sets[0]?.centre(0)).toEqual([0, -20]);
    expect(hall.sets[0]?.centre(3)).toEqual([0, -20 + 3 * COUPLE_PITCH_PX]);
  });

  it("sizes the demo's two-line hall: five couples and four", () => {
    const hall = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
    expect(hall.world).toEqual({ w: 268, h: 282, zoom: 1 });
    expect(hall.sets.map((s) => s.cx)).toEqual([-52, 52]);
    expect(hall.sets.map((s) => s.top)).toEqual([-30, -30]);
    expect(hall.sets.map((s) => s.couples)).toEqual([5, 4]);
  });

  it("grows only downward for the demo's longer lines: eight couples and seven", () => {
    // P1: the hall the page ships went from five-and-four to eight-and-seven.
    // The world's **width** is what a phone fits at 1× (U1, 268 px), and it
    // is fixed by the number of lines — so a longer line may only make the
    // world taller, never wider.
    const was = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
    const now = layoutHall({ lines: 2, couplesPerLine: [8, 7] });
    expect(now.world).toEqual({ w: 268, h: 342, zoom: 1 });
    expect(now.world.w).toBe(was.world.w);
    expect(now.world.h - was.world.h).toBe((8 - 5) * COUPLE_PITCH_PX);
    // Same sets in the same places, just longer.
    expect(now.sets.map((s) => s.cx)).toEqual(was.sets.map((s) => s.cx));
    expect(now.sets.map((s) => s.couples)).toEqual([8, 7]);
  });

  it("leaves the tail below the last couple for the couple waiting out", () => {
    // A duple improper line works in minor sets of two couples, so an odd
    // line always has one couple over at the bottom end, standing one place
    // further down than the last dancing couple. `FLOOR_TAIL_PX` is the floor
    // kept below that, and it has to survive a longer line.
    for (const couples of [4, 5, 8, 9]) {
      const hall = layoutHall({ lines: 2, couplesPerLine: [couples, couples] });
      const set = hall.sets[0]!;
      const waiting = set.centre(couples)[1];
      expect(waiting, `${String(couples)} couples`).toBeLessThan(hall.floorBottom);
      expect(hall.floorBottom - waiting, `${String(couples)} couples`).toBe(FLOOR_TAIL_PX);
    }
  });

  it("sizes a three-line hall and keeps the set pitch", () => {
    const hall = layoutHall({ lines: 3, couplesPerLine: [5, 3, 4] });
    expect(hall.world).toEqual({ w: 372, h: 282, zoom: 1 });
    expect(hall.sets.map((s) => s.cx)).toEqual([-104, 0, 104]);
    expect(hall.sets[1]!.cx - hall.sets[0]!.cx).toBe(SET_PITCH);
    expect(hall.sets[2]!.cx - hall.sets[1]!.cx).toBe(SET_PITCH);
  });

  it("is `SIDE_W * 2 + SET_PITCH * lines` wide, whatever the lines hold", () => {
    for (let lines = 1; lines <= 4; lines++) {
      const hall = layoutHall({ lines, couplesPerLine: Array(lines).fill(3) as number[] });
      expect(hall.world.w).toBe(SIDE_W * 2 + SET_PITCH * lines);
    }
  });

  it("takes its height from the longest line, not from the first", () => {
    const short = layoutHall({ lines: 2, couplesPerLine: [2, 2] });
    const long = layoutHall({ lines: 2, couplesPerLine: [2, 9] });
    expect(long.world.h - short.world.h).toBe((9 - 2) * COUPLE_PITCH_PX);
    expect(long.world.w).toBe(short.world.w);
  });

  it("keeps the last couple of the longest line inside the dance floor", () => {
    const hall = layoutHall({ lines: 2, couplesPerLine: [5, 9] });
    for (const set of hall.sets) {
      expect(set.centre(0)[1]).toBeGreaterThan(hall.floorTop);
      expect(set.centre(set.couples - 1)[1]).toBeLessThan(hall.floorBottom);
    }
  });

  it("stands the two lines of a set the contract's distance apart", () => {
    expect(LINES_APART_PX).toBe(HOLD_SPACING_PX + LINE_OFFSET_PX);
    expect(LINES_APART_PX).toBe(32);
  });

  it("puts the stage across the top, above the floor, with the caller on its lip", () => {
    const hall = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
    expect(hall.stage.top).toBeLessThan(hall.stage.bottom);
    expect(hall.stage.bottom).toBeLessThan(hall.floorTop);
    expect(hall.stage.x0).toBeLessThan(hall.stage.x1);
    expect(hall.caller[1]).toBeLessThanOrEqual(hall.stage.bottom);
    expect(hall.caller[0]).toBeGreaterThan(hall.stage.x0);
    expect(hall.caller[0]).toBeLessThan(hall.stage.x1);
  });

  it("puts a four-piece band on the stage, none of them on top of another", () => {
    const hall = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
    expect(hall.band).toHaveLength(4);
    expect(hall.band.map((m) => m.instrument)).toEqual(["fiddle", "bass", "guitar", "piano"]);
    for (const member of hall.band) {
      expect(member.p[0]).toBeGreaterThan(hall.stage.x0);
      expect(member.p[0]).toBeLessThan(hall.stage.x1);
      expect(member.p[1]).toBeGreaterThan(hall.stage.top);
      expect(member.p[1]).toBeLessThan(hall.stage.bottom);
    }
    for (const a of hall.band) {
      for (const b of hall.band) {
        if (a === b) continue;
        expect(Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1])).toBeGreaterThan(20);
      }
    }
  });

  it("keeps the caller clear of the band, so the bubble does not sit on them", () => {
    const hall = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
    for (const member of hall.band) {
      expect(member.p[0] - hall.caller[0]).toBeGreaterThan(40);
    }
  });

  it("lines both walls with chairs and puts a table by the far wall", () => {
    const hall = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
    expect(hall.chairs.length).toBeGreaterThan(4);
    expect(hall.chairs.some(([x]) => x < 0)).toBe(true);
    expect(hall.chairs.some(([x]) => x > 0)).toBe(true);
    for (const [x, y] of hall.chairs) {
      expect(Math.abs(x)).toBeLessThan(hall.world.w / 2 - hall.wall);
      expect(y).toBeGreaterThan(hall.floorTop);
      expect(y).toBeLessThan(hall.floorBottom);
    }
    expect(hall.table.x + hall.table.w).toBeLessThan(hall.world.w / 2 - hall.wall);
    expect(hall.sideLines.length).toBeGreaterThan(2);
  });

  it("is the same hall every time it is asked for, and a different one per seed", () => {
    const a = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
    const b = layoutHall({ lines: 2, couplesPerLine: [5, 4] });
    const other = layoutHall({ lines: 2, couplesPerLine: [5, 4], seed: 1 });
    expect(a.band.map((m) => m.person.appearance)).toEqual(b.band.map((m) => m.person.appearance));
    expect(a.band.map((m) => m.person.appearance)).not.toEqual(
      other.band.map((m) => m.person.appearance),
    );
  });

  it("refuses a hall it cannot lay out", () => {
    expect(() => layoutHall({ lines: 0, couplesPerLine: [] })).toThrow(/at least one line/);
    expect(() => layoutHall({ lines: 2, couplesPerLine: [4] })).toThrow(/couplesPerLine/);
    expect(() => layoutHall({ lines: 1, couplesPerLine: [0] })).toThrow(/at least one couple/);
  });
});
