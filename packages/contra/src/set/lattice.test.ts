import type { Formation, SetState } from "@caller/choreo";
import { createHall } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { latticeSpan, progressModel, progressSet, setFromModel } from "./lattice.js";
import { parseRelation, relate } from "./relations.js";
import { modelFromSet } from "./SetModel.js";
import { setRulesFor } from "./SetRules.js";

/**
 * The slot-level progression, held against the formation's own.
 *
 * `Formation.progression.next` is the answer every golden in the repository was
 * measured with, so the slot-level rule has to reproduce it exactly wherever a
 * dance progresses the ordinary way — and it is the *shape* of the two answers
 * that matters, not only the places: who is a couple, which way they travel,
 * and who is standing out where.
 */

const NOWHERE = new Map();

/** A set as anything downstream reads it. */
const seating = (set: SetState): string[] =>
  [...set.couples]
    .sort((a, b) => a.place - b.place)
    .map(
      (c) =>
        `${String(c.place)}/${String(c.direction)}: ` +
        `${c.dancers["lark"] ?? "—"} + ${c.dancers["robin"] ?? "—"}`,
    );

const hallOf = (formation: Formation, couples: number): SetState =>
  createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!;

describe("a progression is a shift of every dancer's slot (Q14)", () => {
  it("reproduces duple improper's own progression, every line length, eight times through", () => {
    let cases = 0;
    for (const couples of [2, 3, 4, 5, 6]) {
      let set = hallOf(DUPLE_IMPROPER, couples);
      for (let round = 1; round <= 8; round++) {
        const bySlots = setFromModel(
          progressModel(modelFromSet(DUPLE_IMPROPER, set, NOWHERE)),
          set,
        );
        set = DUPLE_IMPROPER.progression.next(set);
        expect(seating(bySlots), `${String(couples)} couples, round ${String(round)}`).toEqual(
          seating(set),
        );
        cases += 1;
      }
    }
    expect(cases).toBe(40);
  });

  it("refuses a role-asymmetric progression in becket, by name, rather than guessing", () => {
    // A becket line has two different end effects — a waiting couple re-enters
    // the line one dancing place along, an odd line's top couple crosses
    // straight over in place — and they are not one rule on the slots. Nothing
    // in the acceptance set asks for this; M9's triple progression is uniform.
    const set = hallOf(BECKET, 6);
    const model = modelFromSet(BECKET, set, NOWHERE);
    expect(() => progressSet(BECKET, model, set, { lark: 1, robin: 3 })).toThrow(
      /role-asymmetric progression in "becket".*\(M9\)/,
    );
  });

  it("a uniform progression is the formation's own, applied once per place", () => {
    for (const [formation, couples] of [
      [DUPLE_IMPROPER, 5],
      [BECKET, 7],
    ] as const) {
      const set = hallOf(formation, couples);
      const model = modelFromSet(formation, set, NOWHERE);
      expect(seating(progressSet(formation, model, set))).toEqual(
        seating(formation.progression.next(set)),
      );
      // A triple progression (M9's The Set Monster) is three of them.
      expect(seating(progressSet(formation, model, set, { lark: 3, robin: 3 }))).toEqual(
        seating(
          formation.progression.next(formation.progression.next(formation.progression.next(set))),
        ),
      );
    }
  });

  it("knows how far the occupied lattice reaches", () => {
    const span = latticeSpan(modelFromSet(DUPLE_IMPROPER, hallOf(DUPLE_IMPROPER, 4), NOWHERE));
    expect(span).toEqual({
      line: { 0: { lowest: 0, highest: 3 }, 1: { lowest: 0, highest: 3 } },
      lowest: 0,
      highest: 3,
    });
  });
});

describe("the relations are what the progression makes them", () => {
  /**
   * The defining property of `N_k`, and the only thing that pins its sign: the
   * neighbour you have **next** is the neighbour you have after one more time
   * through. Measured for every dancer, every k, at every round.
   *
   * The property is asked wherever **both** answers name somebody, which is the
   * honest scope of it: a dancer who reaches the end of the line turns round,
   * and every offset written along their direction of travel turns round with
   * them, so an offset that ran off the end while it was pointing one way can
   * land on a real dancer once somebody down there has turned. That is a fact
   * about contra rather than about the table. The count below is how many cases
   * really are compared; a wrong sign anywhere would break most of them.
   */
  it("N(k+1) today is N(k) after one progression, wherever both name somebody", () => {
    const counted: Record<string, number> = {};
    for (const [formation, couples] of [
      [DUPLE_IMPROPER, 6],
      [BECKET, 12],
    ] as const) {
      const table = setRulesFor(formation).relations;
      let set = hallOf(formation, couples);
      let cases = 0;
      for (let round = 0; round < 6; round++) {
        const now = modelFromSet(formation, set, NOWHERE);
        const then = modelFromSet(formation, formation.progression.next(set), NOWHERE);
        for (const dancer of Object.values(now.dancers)) {
          if (then.dancers[dancer.id]!.travel !== dancer.travel) continue;
          for (const k of [1, 2, 3]) {
            const next = relate(now, table, dancer.id, { kind: "neighbor", k: k + 1 });
            const after = relate(then, table, dancer.id, { kind: "neighbor", k });
            if (next === undefined || after === undefined) continue;
            expect(next, `${formation.id} ${dancer.id} N${String(k + 1)}`).toBe(after);
            cases += 1;
          }
        }
        set = formation.progression.next(set);
      }
      counted[formation.id] = cases;
    }
    expect(counted).toEqual({ "duple-improper": 48, becket: 96 });
  });

  /** A shadow is the dancer you keep: the progression moves you both alike. */
  it("your shadow is still your shadow after a progression", () => {
    for (const [formation, couples] of [
      [DUPLE_IMPROPER, 6],
      [BECKET, 6],
    ] as const) {
      const table = setRulesFor(formation).relations;
      let set = hallOf(formation, couples);
      for (let round = 0; round < 6; round++) {
        const now = modelFromSet(formation, set, NOWHERE);
        const then = modelFromSet(formation, formation.progression.next(set), NOWHERE);
        for (const dancer of Object.values(now.dancers)) {
          const mine = relate(now, table, dancer.id, parseRelation("shadow"));
          if (mine === undefined) continue;
          const after = relate(then, table, dancer.id, parseRelation("shadow"));
          if (after === undefined) continue;
          expect(after, `${formation.id} ${dancer.id} shadow`).toBe(mine);
        }
        set = formation.progression.next(set);
      }
    }
  });
});

describe("a role-asymmetric progression re-partners the set (Contrablend)", () => {
  it("moves the larks one place and the robins three, and the shadow becomes the partner", () => {
    const set = hallOf(DUPLE_IMPROPER, 6);
    const model = modelFromSet(DUPLE_IMPROPER, set, NOWHERE);
    const table = setRulesFor(DUPLE_IMPROPER).relations;
    const shadow = relate(model, table, "set0/c2/lark", parseRelation("shadow"));
    expect(shadow).toBe("set0/c0/robin");

    const after = progressSet(DUPLE_IMPROPER, model, set, { lark: 1, robin: 3 });
    const couple = after.couples.find((c) => c.dancers["lark"] === "set0/c2/lark")!;
    // The transcript's own "(new partner)": whoever was your shadow is across
    // the set from you when the time through ends.
    expect(couple.dancers["robin"]).toBe(shadow);
    expect(couple.place).toBe(3);
  });

  it("leaves every couple with exactly one lark and one robin, twelve times through", () => {
    let set = hallOf(DUPLE_IMPROPER, 6);
    for (let i = 0; i < 12; i++) {
      const model = modelFromSet(DUPLE_IMPROPER, set, NOWHERE);
      set = progressSet(DUPLE_IMPROPER, model, set, { lark: 1, robin: 3 });
      expect(set.couples).toHaveLength(6);
      for (const couple of set.couples) {
        expect(Object.keys(couple.dancers).sort(), `round ${String(i)}`).toEqual(["lark", "robin"]);
      }
      expect(new Set(set.couples.map((c) => c.place)).size).toBe(6);
    }
  });
});
