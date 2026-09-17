import { describe, expect, it } from "vitest";
import type { DancerId } from "../Dialect.js";
import type { ContraFormation } from "./formations.js";
import { seating } from "./formations.js";
import type { ContraSelector } from "./relations.js";
import { CONTRA_SELECTORS, partnerSide, slotFor } from "./relations.js";

/**
 * The selector table, written out by hand for three hands fours — six couples,
 * twelve dancers — in both formations, and cross-checked against the two facts
 * `packages/contra/src/set/relations.test.ts` asserts about the same words:
 * duple improper's partner is across the set and its neighbour along the line,
 * becket's the other way about; and the relations that pair a set up are their
 * own inverse, dancer by dancer.
 */

type Row = readonly [
  dancer: string,
  partner: DancerId | undefined,
  neighbor: DancerId | undefined,
  across: DancerId | undefined,
  n2: DancerId | undefined,
  shadow: DancerId | undefined,
  leftDiagonal: DancerId | undefined,
  rightDiagonal: DancerId | undefined,
];

const COLUMNS: readonly ContraSelector[] = [
  "partner",
  "neighbor",
  "across",
  "N2",
  "shadow",
  "left-diagonal",
  "right-diagonal",
];

/**
 * Becket, six couples: three hands fours down the hall, with each line half a
 * couple place back along itself (Butter's own start), so the two lines' grids
 * are one couple place apart and the couples at the far end of each line —
 * `2L`/`2R` at the top, `5L`/`5R` at the bottom — face nobody.
 */
const BECKET_SIX: readonly Row[] = [
  //         partner  neighbor across   N2       shadow     left-diag right-diag
  ["1L", "1R", "4R", "4R", "2R", undefined, "2R", "6R"],
  ["1R", "1L", "4L", "4L", "2L", "3L", "2L", "6L"],
  ["2L", "2R", undefined, undefined, "1R", "4R", "1R", undefined],
  ["2R", "2L", undefined, undefined, "1L", undefined, "1L", undefined],
  ["3L", "3R", "6R", "6R", "4R", "1R", "4R", undefined],
  ["3R", "3L", "6L", "6L", "4L", "5L", "4L", undefined],
  ["4L", "4R", "1R", "1R", "3R", "6R", "3R", undefined],
  ["4R", "4L", "1L", "1L", "3L", "2L", "3L", undefined],
  ["5L", "5R", undefined, undefined, "6R", "3R", "6R", undefined],
  ["5R", "5L", undefined, undefined, "6L", undefined, "6L", undefined],
  ["6L", "6R", "3R", "3R", "5R", undefined, "5R", "1R"],
  ["6R", "6L", "3L", "3L", "5L", "4L", "5L", "1L"],
];

/**
 * Duple improper, six couples: the ones face down the hall and the twos up,
 * partners across the set, neighbours along the line. Nobody is off the end
 * here because the set is an even number of couples; the odd set below is
 * where the ends are.
 */
const DUPLE_IMPROPER_SIX: readonly Row[] = [
  //         partner  neighbor across   N2       shadow     left-diag  right-diag
  ["1L", "1R", "2R", "1R", "4R", undefined, undefined, "2L"],
  ["1R", "1L", "2L", "1L", "4L", "3L", "2R", undefined],
  ["2L", "2R", "1R", "2R", undefined, "4R", "3L", "1L"],
  ["2R", "2L", "1L", "2L", undefined, undefined, "1R", "3R"],
  ["3L", "3R", "4R", "3R", "6R", "1R", "2L", "4L"],
  ["3R", "3L", "4L", "3L", "6L", "5L", "4R", "2R"],
  ["4L", "4R", "3R", "4R", "1R", "6R", "5L", "3L"],
  ["4R", "4L", "3L", "4L", "1L", "2L", "3R", "5R"],
  ["5L", "5R", "6R", "5R", undefined, "3R", "4L", "6L"],
  ["5R", "5L", "6L", "5L", undefined, undefined, "6R", "4R"],
  ["6L", "6R", "5R", "6R", "3R", undefined, undefined, "5L"],
  ["6R", "6L", "5L", "6L", "3L", "4L", "5R", undefined],
];

const resolve = (
  formation: ContraFormation,
  couples: number,
  selector: ContraSelector,
  from: DancerId,
): DancerId | undefined => {
  const set = seating(formation, couples);
  const seat = set.seatOf(from);
  if (seat === undefined) throw new Error(`no ${from} in this set`);
  return set.at(slotFor(formation, selector, seat));
};

const checkTable = (formation: ContraFormation, rows: readonly Row[]): void => {
  for (const [dancer, ...expected] of rows) {
    const got = COLUMNS.map((selector) => resolve(formation, rows.length / 2, selector, dancer));
    expect({ dancer, got }).toEqual({ dancer, got: expected });
  }
};

describe("the selector table", () => {
  it("resolves becket's words for three hands fours", () => {
    checkTable("becket", BECKET_SIX);
  });

  it("resolves duple improper's words for six couples", () => {
    checkTable("duple-improper", DUPLE_IMPROPER_SIX);
  });

  it("self is you, in either formation", () => {
    for (const formation of ["becket", "duple-improper"] as const) {
      for (const seat of seating(formation, 6).seats) {
        expect(resolve(formation, 6, "self", seat.id)).toBe(seat.id);
      }
    }
  });
});

describe("the two formations disagree about what is across the set", () => {
  // The fact `packages/contra/src/set/relations.test.ts` exists to assert:
  // "duple improper's partner across and its neighbour along", "becket's
  // partner along and its neighbour across". The same two station ids mean the
  // other thing, which is why the table is the formation's.
  it("puts a becket partner beside you and a duple improper partner across", () => {
    const becket = seating("becket", 6);
    const duple = seating("duple-improper", 6);
    const beside = becket.seats.every((seat) => {
      const partner = becket.seatOf(resolve("becket", 6, "partner", seat.id) ?? "");
      return partner?.line === seat.line;
    });
    const across = duple.seats.every((seat) => {
      const partner = duple.seatOf(resolve("duple-improper", 6, "partner", seat.id) ?? "");
      return partner !== undefined && partner.line !== seat.line;
    });
    expect({ beside, across }).toEqual({ beside: true, across: true });
  });

  it("puts a becket neighbour across and a duple improper neighbour along", () => {
    const becket = seating("becket", 6);
    const duple = seating("duple-improper", 6);
    for (const seat of becket.seats) {
      const neighbor = becket.seatOf(resolve("becket", 6, "neighbor", seat.id) ?? "");
      if (neighbor !== undefined) expect(neighbor.line).not.toBe(seat.line);
    }
    for (const seat of duple.seats) {
      const neighbor = duple.seatOf(resolve("duple-improper", 6, "neighbor", seat.id) ?? "");
      if (neighbor !== undefined) expect(neighbor.line).toBe(seat.line);
    }
  });

  it("names the other role across the set in becket, and your own along it", () => {
    for (const seat of seating("becket", 6).seats) {
      const neighbor = resolve("becket", 6, "neighbor", seat.id);
      if (neighbor !== undefined) expect(neighbor.endsWith("L")).toBe(seat.role === "robin");
      const shadow = resolve("becket", 6, "shadow", seat.id);
      if (shadow !== undefined) expect(shadow.endsWith("L")).toBe(seat.role === "robin");
    }
  });
});

describe("the relations that pair a set up are their own inverse", () => {
  for (const formation of ["becket", "duple-improper"] as const) {
    for (const selector of ["partner", "neighbor", "across", "N2", "shadow"] as const) {
      it(`${formation}: my ${selector}'s ${selector} is me`, () => {
        for (const seat of seating(formation, 6).seats) {
          const them = resolve(formation, 6, selector, seat.id);
          if (them === undefined) continue;
          expect(resolve(formation, 6, selector, them)).toBe(seat.id);
        }
      });
    }
    it(`${formation}: a diagonal is its own inverse too`, () => {
      // Two dancers who see each other diagonally across the set agree about
      // which diagonal they are on: in becket both say "right", in duple
      // improper the corner rows pair a first corner with a first corner.
      for (const seat of seating(formation, 6).seats) {
        for (const selector of ["left-diagonal", "right-diagonal"] as const) {
          const them = resolve(formation, 6, selector, seat.id);
          if (them === undefined) continue;
          expect(resolve(formation, 6, selector, them)).toBe(seat.id);
        }
      }
    });
  }
});

describe("the end of a line", () => {
  it("answers nobody, rather than pointing back at somebody", () => {
    // An odd duple improper set leaves the couple at the bottom travelling
    // down with nobody below them — the same end-of-set fact
    // `relations.test.ts` checks in engine 2.
    const ends = seating("duple-improper", 5).seats.filter(
      (seat) => resolve("duple-improper", 5, "neighbor", seat.id) === undefined,
    );
    expect(ends.map((seat) => seat.id)).toEqual(["5L", "5R"]);
  });

  it("leaves a becket end couple facing nobody at beat 0", () => {
    const ends = seating("becket", 6).seats.filter(
      (seat) => resolve("becket", 6, "neighbor", seat.id) === undefined,
    );
    expect(ends.map((seat) => seat.id)).toEqual(["2L", "2R", "5L", "5R"]);
  });
});

describe("the offsets themselves", () => {
  it("knows its eight words and no others", () => {
    expect(CONTRA_SELECTORS).toEqual([
      "self",
      "partner",
      "neighbor",
      "across",
      "N2",
      "shadow",
      "left-diagonal",
      "right-diagonal",
    ]);
  });

  it("gives the two roles opposite partner sides, which is what makes shadow symmetric", () => {
    expect(partnerSide("lark")).toBe(1);
    expect(partnerSide("robin")).toBe(-1);
  });

  it("makes becket's N2 the couple a dancer faces after the shift", () => {
    // Butter's first figure is a shift left; the couple it shifts to is the
    // one `N2` names from the record's own start places.
    expect(resolve("becket", 6, "N2", "1L")).toBe("2R");
    expect(resolve("becket", 6, "N2", "1R")).toBe("2L");
    expect(resolve("becket", 6, "N2", "2L")).toBe("1R");
    expect(resolve("becket", 6, "N2", "2R")).toBe("1L");
  });

  it("counts duple improper's next neighbour three places along", () => {
    const set = seating("duple-improper", 6);
    for (const seat of set.seats) {
      const n2 = set.seatOf(resolve("duple-improper", 6, "N2", seat.id) ?? "");
      if (n2 === undefined) continue;
      expect(n2.position - seat.position).toBe(3 * seat.travel);
    }
  });
});
