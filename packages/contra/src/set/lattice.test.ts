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
    expect(() => progressSet(BECKET, model, set, { places: { lark: 1, robin: 3 } })).toThrow(
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
      expect(
        seating(progressSet(formation, model, set, { places: { lark: 3, robin: 3 } })),
      ).toEqual(
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
   * M6's sign invariant — the neighbour you have **next** is the neighbour you
   * have after one more time through — **restored for becket by FR-C2**.
   *
   * It is asked wherever **both** answers name somebody, which is the honest
   * scope of it: a dancer who reaches the end of the line turns round, and every
   * offset written along their direction of travel turns round with them.
   *
   * **Why it holds again.** Write `N_k = across + (k − 1) × s` positions along
   * the other line. One time through moves the asking dancer `p` positions and
   * the other line `−p`, so the couple standing where `N_k` pointed has been
   * replaced by the one that was `2p` further on; the invariant is
   * `(k − 1)s + 2p = k·s`, that is `s = 2p`, uniquely. FR-C1 had to break it:
   * the model then slid a whole couple place a line (`p = −2`) while the
   * caller's "next neighbour" is one couple place (`s = −2`), and every one of
   * the 216 compared becket cases disagreed by exactly one place. FR-C2's
   * half-width slide makes `p = −1`, so `s = 2p = −2` is both the caller's word
   * and the geometry, and the two agree at every case.
   *
   * The counts are asserted so that the day somebody puts the whole-place slide
   * back, this test says how much it costs.
   */
  it("N(k+1) today is N(k) after one progression, in both formations", () => {
    const counted: Record<string, { agree: number; disagree: number }> = {};
    for (const [formation, couples] of [
      [DUPLE_IMPROPER, 6],
      [BECKET, 12],
    ] as const) {
      const table = setRulesFor(formation).relations;
      let set = hallOf(formation, couples);
      let agree = 0;
      let disagree = 0;
      for (let round = 0; round < 6; round++) {
        const now = modelFromSet(formation, set, NOWHERE);
        const then = modelFromSet(formation, formation.progression.next(set), NOWHERE);
        for (const dancer of Object.values(now.dancers)) {
          if (then.dancers[dancer.id]!.travel !== dancer.travel) continue;
          for (const k of [1, 2, 3]) {
            const next = relate(now, table, dancer.id, { kind: "neighbor", k: k + 1 });
            const after = relate(then, table, dancer.id, { kind: "neighbor", k });
            if (next === undefined || after === undefined) continue;
            if (next === after) {
              agree += 1;
              continue;
            }
            disagree += 1;
            expect.fail(`${formation.id} ${dancer.id} N${String(k + 1)} is not N${String(k)} next`);
          }
        }
        set = formation.progression.next(set);
      }
      counted[formation.id] = { agree, disagree };
    }
    expect(counted).toEqual({
      "duple-improper": { agree: 48, disagree: 0 },
      becket: { agree: 252, disagree: 0 },
    });
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

    const after = progressSet(DUPLE_IMPROPER, model, set, { places: { lark: 1, robin: 3 } });
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
      set = progressSet(DUPLE_IMPROPER, model, set, { places: { lark: 1, robin: 3 } });
      expect(set.couples).toHaveLength(6);
      for (const couple of set.couples) {
        expect(Object.keys(couple.dancers).sort(), `round ${String(i)}`).toEqual(["lark", "robin"]);
      }
      expect(new Set(set.couples.map((c) => c.place)).size).toBe(6);
    }
  });
});

/**
 * **The swap-sides progression** (M8b): `RoleShift.line`, the second axis a
 * progression turned out to have, and Rick Mohr's Anna's Reel is the dance.
 *
 * Two claims, and they are the whole of what "other; single, swap sides" means:
 * everybody crosses the set while still travelling the way they were, and doing
 * it twice puts everybody back on their own line two places along — which is
 * why such a dance is written as **two passes with the roles exchanged** and
 * not as one.
 */
describe("a swap-sides progression crosses the set (Anna's Reel)", () => {
  const SWAP = { places: { lark: 1, robin: 1 }, line: "swap" } as const;

  it("crosses every dancer over and leaves them travelling the way they were", () => {
    const set = hallOf(DUPLE_IMPROPER, 6);
    const model = modelFromSet(DUPLE_IMPROPER, set, NOWHERE);
    const after = progressModel(model, SWAP);
    for (const was of Object.values(model.dancers)) {
      const now = after.dancers[was.id]!;
      expect(now.slot.line, `${was.id} line`).not.toBe(was.slot.line);
      expect(now.travel, `${was.id} travel`).toBe(was.travel);
      // One dancing place along, the way they travel — the `places` half.
      expect(now.slot.position, `${was.id} position`).toBe(was.slot.position + was.travel);
    }
  });

  it("puts the other role on each line, which is why the second pass is the mirror", () => {
    const set = hallOf(DUPLE_IMPROPER, 6);
    const model = modelFromSet(DUPLE_IMPROPER, set, NOWHERE);
    const rolesOn = (m: typeof model, line: 0 | 1, travel: 1 | -1): Set<string> =>
      new Set(
        Object.values(m.dancers)
          .filter((d) => d.slot.line === line && d.travel === travel)
          .map((d) => d.role),
      );
    // Improper: the dancers travelling one way on one line are all one role.
    expect(rolesOn(model, 1, 1)).toEqual(new Set(["lark"]));
    expect(rolesOn(progressModel(model, SWAP), 1, 1)).toEqual(new Set(["robin"]));
  });

  it("is its own inverse: twice through is your own line, two places along", () => {
    const set = hallOf(DUPLE_IMPROPER, 6);
    const model = modelFromSet(DUPLE_IMPROPER, set, NOWHERE);
    const twice = progressModel(progressModel(model, SWAP), SWAP);
    for (const was of Object.values(model.dancers)) {
      const now = twice.dancers[was.id]!;
      // Interior dancers only: the ends turn round, which is the formation's
      // own end effect and not the swap's.
      if (Math.abs(was.slot.position + was.travel * 2 - 2.5) > 2.5) continue;
      expect(now.slot.line, `${was.id} line`).toBe(was.slot.line);
      expect(now.travel, `${was.id} travel`).toBe(was.travel);
      expect(now.slot.position, `${was.id} position`).toBe(was.slot.position + was.travel * 2);
    }
  });

  /**
   * **A swap is invisible to the hall's seating, and that is a finding rather
   * than a bug — but it is a limit worth writing down.**
   *
   * `SetState` records who is a couple, at which place, travelling which way,
   * and a line swap changes none of the three: everybody keeps their place and
   * their travel, and a couple is still a couple. What it changes is which
   * **line** each dancer stands on, which lives on the slot and therefore in the
   * `SetModel`. So `progressSet` answers the same seating as the plain
   * progression, and the swap survives a **pass** boundary (where `planCycle`
   * carries the model forward with `progressModel`) and is lost at a **cycle**
   * boundary (where the model is rebuilt from the seating with `modelFromSet`).
   *
   * For Anna's Reel that is exactly right: it swaps twice per time through the
   * record, and two swaps are none. A one-pass swap-sides dance would need the
   * seating to carry it, and there is nowhere in `CoupleState` to put it — see
   * this milestone's report.
   */
  it("changes the slots and not the seating, which is why two passes is one cycle", () => {
    const set = hallOf(DUPLE_IMPROPER, 6);
    const model = modelFromSet(DUPLE_IMPROPER, set, NOWHERE);
    expect(seating(progressSet(DUPLE_IMPROPER, model, set, SWAP))).toEqual(
      seating(DUPLE_IMPROPER.progression.next(set)),
    );
    const lines = (m: typeof model): string =>
      Object.values(m.dancers)
        .map((d) => `${d.id}:${String(d.slot.line)}`)
        .sort()
        .join(" ");
    expect(lines(progressModel(model, SWAP))).not.toEqual(lines(progressModel(model)));
  });
});
