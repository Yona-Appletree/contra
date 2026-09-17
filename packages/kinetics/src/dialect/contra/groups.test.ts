import { describe, expect, it } from "vitest";
import type { ContraFormation } from "./formations.js";
import { seating } from "./formations.js";
import { CONTRA_GROUPS, handsFour, isContraGroup } from "./groups.js";
import { slotFor } from "./relations.js";

const four = (formation: ContraFormation, couples: number, from: string) =>
  handsFour(seating(formation, couples), from);

describe("hands four in becket", () => {
  // At beat 0 a becket set stands where Butter's record starts it — half a
  // couple place back along each line — so the ring a dancer is standing in is
  // the couple across from them on the floor, which is not the couple their
  // number pairs them with. `1L` circles with `4L`/`4R`; the shift makes
  // couple 2 their new four, which is what P10's first figure is for.
  it("is the four you are standing in, clockwise from you", () => {
    expect(four("becket", 6, "1L")).toEqual(["1L", "4R", "4L", "1R"]);
  });

  it("is the same ring read from each of the four", () => {
    expect(four("becket", 6, "4R")).toEqual(["4R", "4L", "1R", "1L"]);
    expect(four("becket", 6, "4L")).toEqual(["4L", "1R", "1L", "4R"]);
    expect(four("becket", 6, "1R")).toEqual(["1R", "1L", "4R", "4L"]);
  });

  it("is a ring per hands four down the hall", () => {
    expect(four("becket", 6, "3L")).toEqual(["3L", "6R", "6L", "3R"]);
    expect(four("becket", 6, "6L")).toEqual(["6L", "3R", "3L", "6R"]);
  });

  it("is nobody for the couples at the end of a line", () => {
    for (const id of ["2L", "2R", "5L", "5R"]) {
      expect(four("becket", 6, id)).toBeUndefined();
    }
  });
});

describe("hands four in duple improper", () => {
  it("is your couple and the couple you are dancing with", () => {
    expect(four("duple-improper", 6, "1L")).toEqual(["1L", "2R", "2L", "1R"]);
    expect(four("duple-improper", 6, "1R")).toEqual(["1R", "1L", "2R", "2L"]);
    expect(four("duple-improper", 6, "2L")).toEqual(["2L", "1R", "1L", "2R"]);
    expect(four("duple-improper", 6, "2R")).toEqual(["2R", "2L", "1R", "1L"]);
  });

  it("moves down the hall a hands four at a time", () => {
    expect(four("duple-improper", 6, "3L")).toEqual(["3L", "4R", "4L", "3R"]);
    expect(four("duple-improper", 6, "5L")).toEqual(["5L", "6R", "6L", "5R"]);
  });

  it("is nobody for a couple with no neighbour below them", () => {
    expect(four("duple-improper", 5, "5L")).toBeUndefined();
    expect(four("duple-improper", 5, "5R")).toBeUndefined();
  });
});

describe("the ring", () => {
  it("holds you, your partner, your neighbour and their partner", () => {
    for (const formation of ["becket", "duple-improper"] as const) {
      const set = seating(formation, 6);
      for (const seat of set.seats) {
        const ring = handsFour(set, seat.id);
        if (ring === undefined) continue;
        expect(ring).toHaveLength(4);
        expect(new Set(ring).size).toBe(4);
        expect(ring[0]).toBe(seat.id);
        // Two couples, each whole.
        const couples = new Set(ring.map((id) => set.seatOf(id)?.couple));
        expect(couples.size).toBe(2);
      }
    }
  });

  it("turns one way round the ring, never back on itself", () => {
    for (const formation of ["becket", "duple-improper"] as const) {
      const set = seating(formation, 6);
      for (const seat of set.seats) {
        const ring = handsFour(set, seat.id);
        if (ring === undefined) continue;
        const places = ring.map((id) => set.seatOf(id));
        const cx = places.reduce((sum, s) => sum + (s?.p[0] ?? 0), 0) / 4;
        const cy = places.reduce((sum, s) => sum + (s?.p[1] ?? 0), 0) / 4;
        const angles = places.map((s) => Math.atan2((s?.p[1] ?? 0) - cy, (s?.p[0] ?? 0) - cx));
        for (let i = 0; i < 4; i += 1) {
          const from = angles[i] ?? 0;
          const to = angles[(i + 1) % 4] ?? 0;
          const step = (to - from + 2 * Math.PI) % (2 * Math.PI);
          // Every step goes the same way round, and none of them is a jump
          // across the ring: a circle left walks you into the next place.
          expect(step).toBeGreaterThan(0);
          expect(step).toBeLessThan(Math.PI);
        }
      }
    }
  });

  it("puts your partner and your neighbour beside you, and their partner across", () => {
    for (const formation of ["becket", "duple-improper"] as const) {
      const set = seating(formation, 6);
      for (const seat of set.seats) {
        const ring = handsFour(set, seat.id);
        if (ring === undefined) continue;
        const partner = set.at(slotFor(formation, "partner", seat));
        const neighbor = set.at(slotFor(formation, "neighbor", seat));
        expect(new Set([ring[1], ring[3]])).toEqual(new Set([partner, neighbor]));
        const their = set.seatOf(neighbor ?? "");
        expect(ring[2]).toBe(their && set.at(slotFor(formation, "partner", their)));
      }
    }
  });

  it("knows one group word, and answers nobody for a dancer who is not in the set", () => {
    expect(CONTRA_GROUPS).toEqual(["hands-four"]);
    expect(isContraGroup("hands-four")).toBe(true);
    expect(isContraGroup("shadow-pair")).toBe(false);
    expect(four("becket", 6, "9L")).toBeUndefined();
  });
});
