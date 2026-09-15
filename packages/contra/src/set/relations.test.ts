import { createHall } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { NEIGHBORS, PARTNERS } from "../figures/pairing.js";
import {
  isRelationWord,
  isSymmetricRelation,
  parseRelation,
  relate,
  relationWord,
} from "./relations.js";
import { modelFromSet } from "./SetModel.js";
import { setRulesFor } from "./SetRules.js";

/**
 * Relations as lattice offsets, and the one fact that makes them the
 * formation's: duple improper and becket give **opposite** answers for
 * "partner" and "neighbour" from the same lattice.
 */

const NOWHERE = new Map();

function modelAnd(formation: typeof DUPLE_IMPROPER, couples: number) {
  const set = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!;
  return {
    set,
    model: modelFromSet(formation, set, NOWHERE),
    table: setRulesFor(formation).relations,
  };
}

describe("parsing a relation word", () => {
  it("reads the corpus's own words", () => {
    expect(parseRelation("partner")).toEqual({ kind: "partner" });
    expect(parseRelation("partners")).toEqual({ kind: "partner" });
    expect(parseRelation("neighbour")).toEqual({ kind: "neighbor", k: 1 });
    expect(parseRelation("N1")).toEqual({ kind: "neighbor", k: 1 });
    expect(parseRelation("N0")).toEqual({ kind: "neighbor", k: 0 });
    expect(parseRelation("N4")).toEqual({ kind: "neighbor", k: 4 });
    expect(parseRelation("shadow")).toEqual({ kind: "shadow", k: 1 });
    expect(parseRelation("S2")).toEqual({ kind: "shadow", k: 2 });
    expect(parseRelation("opposite")).toEqual({ kind: "opposite" });
    expect(parseRelation("self")).toEqual({ kind: "self" });
  });

  it("refuses a word that is not a relation", () => {
    expect(() => parseRelation("larks")).toThrow(/not a relation: "larks"/);
    expect(isRelationWord("larks")).toBe(false);
    expect(isRelationWord("N2")).toBe(true);
  });

  it("reads the two rows nothing calls yet", () => {
    expect(parseRelation("trail-buddy")).toEqual({ kind: "trail-buddy", k: 1 });
    expect(parseRelation("T2")).toEqual({ kind: "trail-buddy", k: 2 });
    expect(parseRelation("corner")).toEqual({ kind: "corner", k: 1 });
    expect(parseRelation("C2")).toEqual({ kind: "corner", k: 2 });
  });

  it("writes a relation back as the word a dance record uses", () => {
    for (const word of [
      "partner",
      "neighbor",
      "N3",
      "shadow",
      "S2",
      "opposite",
      "trail-buddy",
      "T2",
      "corner",
      "C2",
      "self",
    ]) {
      expect(relationWord(parseRelation(word))).toBe(word);
    }
  });
});

describe("the formations disagree about what is across the set", () => {
  it("resolves duple improper's partner across and its neighbour along", () => {
    const { model, table, set } = modelAnd(DUPLE_IMPROPER, 4);
    const plan = DUPLE_IMPROPER.groupsFor("hands-four", set).find((p) => p.kind === "set")!;
    for (const [a, b] of PARTNERS) {
      expect(relate(model, table, plan.members[a]!, { kind: "partner" })).toBe(plan.members[b]);
    }
    for (const [a, b] of NEIGHBORS) {
      expect(relate(model, table, plan.members[a]!, { kind: "neighbor", k: 1 })).toBe(
        plan.members[b],
      );
    }
  });

  it("resolves becket's partner along and its neighbour across", () => {
    const { model, table, set } = modelAnd(BECKET, 8);
    const plan = BECKET.groupsFor("hands-four", set).find((p) => p.kind === "set")!;
    // The same two station ids, in a formation where they mean the other thing:
    // this is why the table is the formation's and not `@caller/choreo`'s.
    for (const [a, b] of PARTNERS) {
      expect(relate(model, table, plan.members[a]!, { kind: "partner" })).toBe(plan.members[b]);
    }
    for (const [a, b] of NEIGHBORS) {
      expect(relate(model, table, plan.members[a]!, { kind: "neighbor", k: 1 })).toBe(
        plan.members[b],
      );
    }
  });

  it("answers `undefined` for a slot nobody stands on", () => {
    const { model, table } = modelAnd(DUPLE_IMPROPER, 5);
    // An odd line leaves the couple at the bottom travelling down with nobody
    // below them; the end-effects policy is M6's.
    const ends = Object.values(model.dancers).filter(
      (d) => relate(model, table, d.id, { kind: "neighbor", k: 1 }) === undefined,
    );
    expect(ends.length).toBeGreaterThan(0);
  });

  it("is symmetric: my neighbour's neighbour is me", () => {
    for (const [formation, couples] of [
      [DUPLE_IMPROPER, 5],
      [BECKET, 7],
    ] as const) {
      const { model, table } = modelAnd(formation, couples);
      for (const dancer of Object.values(model.dancers)) {
        for (const rel of [{ kind: "partner" }, { kind: "neighbor", k: 1 }] as const) {
          const other = relate(model, table, dancer.id, rel);
          if (other === undefined) continue;
          expect(relate(model, table, other, rel)).toBe(dancer.id);
        }
      }
    }
  });
});

describe("the relation table, over a six-couple set at every round (M6)", () => {
  /**
   * The expectations below are derived **by hand** for one dancer of each kind
   * — a ones lark near the top, a ones lark in the middle, a twos robin — and
   * everybody else is covered by the symmetry and invariant checks that follow.
   * `undefined` is a real answer: the slot is off the end of the set.
   */
  const IMPROPER_ROUND_0: Record<string, Record<string, string | undefined>> = {
    // c0/lark: line 1, position 0, travelling down. The top of the set, so
    // everything behind them is off the end.
    "set0/c0/lark": {
      partner: "set0/c0/robin",
      opposite: "set0/c0/robin",
      N0: undefined,
      N1: "set0/c1/robin",
      N2: "set0/c3/robin",
      N3: "set0/c5/robin",
      N4: undefined,
      shadow: undefined,
      "trail-buddy": "set0/c2/lark",
    },
    // c2/lark: line 1, position 2, travelling down. Far enough in that every
    // row answers somebody.
    "set0/c2/lark": {
      partner: "set0/c2/robin",
      opposite: "set0/c2/robin",
      N0: "set0/c1/robin",
      N1: "set0/c3/robin",
      N2: "set0/c5/robin",
      N3: undefined,
      shadow: "set0/c0/robin",
      "trail-buddy": "set0/c4/lark",
    },
    // c3/robin: line 1, position 3, travelling up — so every offset runs the
    // other way along the set.
    "set0/c3/robin": {
      partner: "set0/c3/lark",
      opposite: "set0/c3/lark",
      N0: "set0/c4/lark",
      N1: "set0/c2/lark",
      N2: "set0/c0/lark",
      N3: undefined,
      shadow: "set0/c1/lark",
      "trail-buddy": "set0/c1/robin",
    },
  };

  /**
   * Becket, six couples: `c0` waits beyond the top, `c1`/`c2` dance at place 0,
   * `c3`/`c4` at place 1 and `c5` waits beyond the bottom. A couple occupies
   * two adjacent positions of **one** line, so a couple place is two positions
   * and the two lines slide past each other four positions a time through.
   */
  const BECKET_ROUND_0: Record<string, Record<string, string | undefined>> = {
    // c1/lark: line 0, position 0, travelling toward the top.
    "set0/c1/lark": {
      partner: "set0/c1/robin",
      opposite: "set0/c2/robin",
      N0: "set0/c5/robin",
      N1: "set0/c2/robin",
      N2: undefined,
      N3: undefined,
      shadow: "set0/c0/robin",
      "trail-buddy": "set0/c3/lark",
    },
    // c4/lark: line 1, position 3, travelling toward the bottom.
    "set0/c4/lark": {
      partner: "set0/c4/robin",
      opposite: "set0/c3/robin",
      N0: "set0/c0/robin",
      N1: "set0/c3/robin",
      N2: undefined,
      N3: undefined,
      shadow: "set0/c5/robin",
      "trail-buddy": "set0/c2/lark",
    },
  };

  /** Every round of a set: as it stands, then after each time through. */
  function rounds(formation: typeof DUPLE_IMPROPER, couples: number, howMany: number) {
    const out = [];
    let set = createHall(formation, [{ id: "set0", couples, centre: [0, 0], axis: 90 }]).sets[0]!;
    for (let i = 0; i < howMany; i++) {
      out.push({ round: i, model: modelFromSet(formation, set, NOWHERE) });
      set = formation.progression.next(set);
    }
    return out;
  }

  const WORDS = [
    "partner",
    "opposite",
    "N0",
    "N1",
    "N2",
    "N3",
    "N4",
    "shadow",
    "S2",
    "trail-buddy",
    "C1",
    "C2",
  ];

  for (const [formation, expected] of [
    [DUPLE_IMPROPER, IMPROPER_ROUND_0],
    [BECKET, BECKET_ROUND_0],
  ] as const) {
    const table = setRulesFor(formation).relations;

    it(`${formation.id}: every hand-derived answer at round 0`, () => {
      const { model } = rounds(formation, 6, 1)[0]!;
      let checked = 0;
      for (const [me, wants] of Object.entries(expected)) {
        expect(model.dancers[me], `${formation.id} has no dancer "${me}"`).toBeDefined();
        for (const [word, want] of Object.entries(wants)) {
          expect(relate(model, table, me, parseRelation(word)), `${me} ${word}`).toBe(want);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });

    it(`${formation.id}: every relation answers, for every dancer, at every round`, () => {
      let cases = 0;
      for (const { model } of rounds(formation, 6, 6)) {
        for (const dancer of Object.values(model.dancers)) {
          for (const word of WORDS) {
            const rel = parseRelation(word);
            const other = relate(model, table, dancer.id, rel);
            cases += 1;
            if (other === undefined) continue;
            expect(other, `${dancer.id} ${word}`).not.toBe(dancer.id);
            // A symmetric relation is its own inverse, which is what lets it
            // pair a set up; a directional one is not asked to be.
            if (isSymmetricRelation(rel)) {
              expect(relate(model, table, other, rel), `${dancer.id} ${word} back`).toBe(dancer.id);
            }
          }
        }
      }
      // Twelve dancers × twelve words × six rounds.
      expect(cases).toBe(12 * WORDS.length * 6);
    });

    it(`${formation.id}: a neighbour is the other role, a shadow travels with you`, () => {
      for (const { model } of rounds(formation, 6, 6)) {
        for (const me of Object.values(model.dancers)) {
          for (const k of [0, 1, 2, 3, 4]) {
            const n = relate(model, table, me.id, { kind: "neighbor", k });
            if (n !== undefined) {
              const them = model.dancers[n]!;
              expect(them.role, `${me.id} N${String(k)} role`).not.toBe(me.role);
              expect(them.travel, `${me.id} N${String(k)} travel`).toBe(-me.travel);
            }
            if (k === 0) continue;
            const s = relate(model, table, me.id, { kind: "shadow", k });
            if (s === undefined) continue;
            const them = model.dancers[s]!;
            expect(them.role, `${me.id} S${String(k)} role`).not.toBe(me.role);
            // The whole point of a shadow: they progress the way you do, so
            // you keep meeting them and never dance with them.
            expect(them.travel, `${me.id} S${String(k)} travel`).toBe(me.travel);
          }
        }
      }
    });

    it(`${formation.id}: a trail buddy is your own role, travelling with you`, () => {
      for (const { model } of rounds(formation, 6, 6)) {
        for (const me of Object.values(model.dancers)) {
          const t = relate(model, table, me.id, { kind: "trail-buddy", k: 1 });
          if (t === undefined) continue;
          const them = model.dancers[t]!;
          expect(them.role, `${me.id} trail-buddy role`).toBe(me.role);
          expect(them.travel, `${me.id} trail-buddy travel`).toBe(me.travel);
        }
      }
    });
  }

  it("answers `self` without asking the table at all", () => {
    const { model, table } = modelAnd(BECKET, 6);
    const me = Object.keys(model.dancers)[0]!;
    expect(relate(model, table, me, { kind: "self" })).toBe(me);
  });
});
