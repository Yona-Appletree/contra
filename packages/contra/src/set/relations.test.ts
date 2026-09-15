import { createHall } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { NEIGHBORS, PARTNERS } from "../figures/pairing.js";
import { isRelationWord, parseRelation, relate, relationWord } from "./relations.js";
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

  it("writes a relation back as the word a dance record uses", () => {
    for (const word of ["partner", "neighbor", "N3", "shadow", "S2", "opposite", "self"]) {
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

describe("what M1 has not built yet says so, by name", () => {
  it("throws `unsupported: <word> (M6)` for every relation M6 owns", () => {
    const { model, table } = modelAnd(DUPLE_IMPROPER, 4);
    const me = Object.keys(model.dancers)[0]!;
    for (const word of ["N0", "N2", "shadow", "S2", "opposite"]) {
      expect(() => relate(model, table, me, parseRelation(word))).toThrow(
        `unsupported: ${word} (M6)`,
      );
    }
  });

  it("answers `self` without asking the table at all", () => {
    const { model, table } = modelAnd(BECKET, 6);
    const me = Object.keys(model.dancers)[0]!;
    expect(relate(model, table, me, { kind: "self" })).toBe(me);
  });
});
