import { createHall } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { NEIGHBORS, PARTNERS } from "../figures/pairing.js";
import { relatedPairs } from "./lattice.js";
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
   * two adjacent positions of **one** line, so a couple place is two positions;
   * the two lines slide past each other four positions a time through, and
   * since FR-C1 `N_k` steps **two** — one couple place, the way your own couple
   * is going (E3, DD49, and `becket.ts`'s `NEXT_NEIGHBOUR_STEP`).
   *
   * So the whole line of neighbours is read off the floor rather than off the
   * set's loop: `N0` is the couple across and one place behind you, `N1` the
   * couple you face, `N2` the couple across and one place ahead, and each one
   * further is one place further, until the count runs off the end of the other
   * line and answers nobody. Six couples is short enough that it runs off
   * quickly: line 0 holds positions `−2 … 3` and line 1 holds `0 … 5`, so the
   * couples dancing at place 0 have no `N2` at all and the ones at place 1 do.
   *
   * Written out for `c1/lark`, at line 0 position 0 travelling `+1`, whose own
   * couple slides toward `−position`:
   *
   * ```text
   *   N_k = line 1, position 0 − 2(k − 1)
   *   k = 0 → 2 (c4/robin)   k = 1 → 0 (c2/robin)   k = 2 → −2 (nobody)
   * ```
   */
  const BECKET_ROUND_0: Record<string, Record<string, string | undefined>> = {
    // c1/lark: line 0, position 0, travelling toward the top — the top end of
    // the dancing line, so the couple it is heading for is off the lattice.
    "set0/c1/lark": {
      partner: "set0/c1/robin",
      opposite: "set0/c2/robin",
      N0: "set0/c4/robin",
      N1: "set0/c2/robin",
      N2: undefined,
      N3: undefined,
      N4: undefined,
      shadow: "set0/c0/robin",
      S2: "set0/c2/robin",
      "trail-buddy": "set0/c3/lark",
    },
    // c3/lark: line 0, position 2, travelling toward the top — one place
    // further down, so this one has an `N2`: the couple at place 0 on line 1.
    "set0/c3/lark": {
      partner: "set0/c3/robin",
      opposite: "set0/c4/robin",
      N0: "set0/c5/robin",
      N1: "set0/c4/robin",
      N2: "set0/c2/robin",
      N3: undefined,
      shadow: "set0/c1/robin",
      S2: "set0/c0/robin",
      "trail-buddy": "set0/c5/lark",
    },
    // c4/lark: line 1, position 3, travelling toward the bottom, so its own
    // count runs the other way along the lattice and off the far end.
    "set0/c4/lark": {
      partner: "set0/c4/robin",
      opposite: "set0/c3/robin",
      N0: "set0/c1/robin",
      N1: "set0/c3/robin",
      N2: undefined,
      N3: undefined,
      N4: undefined,
      shadow: "set0/c5/robin",
      S2: "set0/c3/robin",
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

    /**
     * **Who a relation names, and the one claim M8b had to stop making about
     * becket.**
     *
     * The *role* claims hold everywhere and are what every pairing depends on:
     * a neighbour and a shadow are the other role, a trail buddy is yours.
     *
     * The *travel* claims — a neighbour travels the other way, a shadow travels
     * yours — are **duple improper's**, where every row is a straight offset
     * along two straight lines. Becket's are steps round a closed loop
     * (`becket.ts`'s {@link BecketLoop}, DD28), and a loop has two points where
     * it changes line: a couple runs off the end of one line and comes back up
     * the other. A relation whose step crosses one of those says something true
     * about a *time through* rather than about today's geometry — your shadow
     * is standing out at the end of the set while you are still dancing, and
     * will be beside you again next time through. Asserting a direction of
     * travel there would be asserting that a becket set is two straight lines,
     * which is exactly the claim that made `N2` pair 2 couples of 8.
     *
     * What becket gets instead is stronger and is measured two tests down:
     * `N_k` today **is** who you face `k − 1` times through from now, read off
     * the set progressed by becket's own `Progression.next`; and, in
     * `lattice.test.ts`, that your shadow is still your shadow after a
     * progression — the definitional property the travel claim was a proxy for,
     * which the loop rows keep for every dancer rather than for some.
     */
    it(`${formation.id}: a neighbour is the other role, a shadow is the other role`, () => {
      const alongTheLines = formation === DUPLE_IMPROPER;
      for (const { model } of rounds(formation, 6, 6)) {
        for (const me of Object.values(model.dancers)) {
          for (const k of [0, 1, 2, 3, 4]) {
            const n = relate(model, table, me.id, { kind: "neighbor", k });
            if (n !== undefined) {
              const them = model.dancers[n]!;
              expect(them.role, `${me.id} N${String(k)} role`).not.toBe(me.role);
              if (alongTheLines) {
                expect(them.travel, `${me.id} N${String(k)} travel`).toBe(-me.travel);
              }
            }
            if (k === 0) continue;
            const s = relate(model, table, me.id, { kind: "shadow", k });
            if (s === undefined) continue;
            const them = model.dancers[s]!;
            expect(them.role, `${me.id} S${String(k)} role`).not.toBe(me.role);
            // The whole point of a shadow: they progress the way you do, so
            // you keep meeting them and never dance with them.
            if (alongTheLines) {
              expect(them.travel, `${me.id} S${String(k)} travel`).toBe(me.travel);
            }
          }
        }
      }
    });

    it(`${formation.id}: a trail buddy is your own role`, () => {
      for (const { model } of rounds(formation, 6, 6)) {
        for (const me of Object.values(model.dancers)) {
          const t = relate(model, table, me.id, { kind: "trail-buddy", k: 1 });
          if (t === undefined) continue;
          const them = model.dancers[t]!;
          expect(them.role, `${me.id} trail-buddy role`).toBe(me.role);
          // Same story as the shadow above, and this row is `(unsure)` anyway:
          // nothing calls a trail buddy yet.
          if (formation === DUPLE_IMPROPER) {
            expect(them.travel, `${me.id} trail-buddy travel`).toBe(me.travel);
          }
        }
      }
    });
  }

  /**
   * **DD28's own measurement, as a regression**: how many of a bare lattice's
   * dancers each relation pairs up, with no dance in it at all.
   *
   * `relatedPairs(model, rel, everybody)` over an eight-couple set of each
   * formation. Sixteen dancers make at most eight pairs, so `6/8` means twelve
   * dancers found each other and four did not.
   *
   * Read the becket row across: **one couple fewer at each end per k**, which
   * is what an offset along two straight lines does. M8b's loop row read `6, 6,
   * 6, 6` — the same count at every k, because a rotation of a closed loop
   * never runs out of set — and FR-C1's ruling (E3, DD49) takes the neighbour
   * rows off the loop, so `N_k` counts couples along the floor again and the
   * ends are ends. M6's own row read `6, 2, 0, 0`: the same shape, two couple
   * places a step instead of one.
   *
   * Duple improper's row alternates `8, 6, 8, 6` for the same reason read the
   * other way: an even line dances everybody one time through and stands two
   * couples out the next. **It falls off after N2 and that is a known gap, not
   * a property of the formation** — a duple improper set is a loop too (a couple
   * that runs out of line waits a time through and comes back up the other
   * line), and this table has never followed it round. It is left alone here on
   * purpose: Whoosh is in the programme, its A1 reaches N3 and N4, and every
   * number, plate and strip of it was measured against these answers. See this
   * milestone's report.
   */
  it("counts who each relation pairs on a bare eight-couple lattice (DD28)", () => {
    const counts = (formation: typeof DUPLE_IMPROPER): Record<string, string> => {
      const { model } = modelAnd(formation, 8);
      const everybody = new Set(Object.keys(model.dancers));
      const row: Record<string, string> = {};
      for (const word of ["N1", "N2", "N3", "N4", "shadow", "S2"]) {
        row[word] = `${String(relatedPairs(model, parseRelation(word), everybody).length)}/8`;
      }
      return row;
    };
    expect(counts(BECKET)).toEqual({
      N1: "6/8",
      // One couple place a step (FR-C1), so the row falls away one couple at
      // each end per k, exactly as duple improper's does — a becket line is two
      // straight lines again as far as a neighbour is concerned.
      N2: "4/8",
      N3: "2/8",
      N4: "0/8",
      // A shadow is never out: the loop keeps every dancer one of them.
      shadow: "8/8",
      S2: "8/8",
    });
    expect(counts(DUPLE_IMPROPER)).toEqual({
      N1: "8/8",
      N2: "6/8",
      N3: "4/8",
      N4: "2/8",
      shadow: "6/8",
      S2: "4/8",
    });
  });

  /**
   * **What `N_k` means, checked against the hall rather than against itself.**
   *
   * Progress the set `k − 1` times with the formation's **own**
   * `Progression.next`, ask who is across the set from whom there, and compare
   * with what the table answers today. This is the claim DD28 is about, and it
   * is the one measurement that can tell a wrong offset from a missing end.
   *
   * **This is the measurement FR-C1 is honest about rather than quiet about.**
   * The user's ruling (E3, DD49) is that becket's `N2` is the couple across the
   * set and one couple place along — *"your next neighbor"* — and the hall,
   * asked, says the couple you face one progression from now is the couple
   * across and **two** couple places along, because both lines slide one place
   * a time through and they face opposite ways. The two readings are not the
   * same couple and nothing can make them so, so this test stopped asserting
   * that they are and started counting.
   *
   * Duple improper's row is the control and is untouched: still never the wrong
   * dancer, still silent at `N3` and beyond (M8b's known gap), by the same
   * counts as before.
   */
  it("N_k against the hall: duple improper's is who you face k−1 times through, becket's is not", () => {
    const counted: Record<string, { same: number; other: number; silent: number }> = {};
    for (const [formation, lengths] of [
      [BECKET, [8, 12]],
      [DUPLE_IMPROPER, [8, 12]],
    ] as const) {
      const table = setRulesFor(formation).relations;
      let same = 0;
      let other = 0;
      let silent = 0;
      for (const couples of lengths) {
        const now = modelAnd(formation, couples);
        for (const k of [1, 2, 3, 4]) {
          let set = now.set;
          for (let i = 1; i < k; i++) set = formation.progression.next(set);
          const later = modelFromSet(formation, set, NOWHERE);
          for (const dancer of Object.values(now.model.dancers)) {
            const hall = relate(later, table, dancer.id, { kind: "neighbor", k: 1 });
            const said = relate(now.model, table, dancer.id, { kind: "neighbor", k });
            if (said === undefined) {
              if (hall !== undefined) silent += 1;
              continue;
            }
            if (said === hall) {
              same += 1;
              continue;
            }
            other += 1;
            // Only becket's row names a dancer the hall does not: duple
            // improper's offsets are still exactly the hall's own.
            expect(formation.id, `${formation.id} ${String(couples)}c ${dancer.id} N${k}`).toBe(
              "becket",
            );
          }
        }
      }
      counted[formation.id] = { same, other, silent };
    }
    // Becket's 32 agreements are **`k = 1` and nothing else** — 12 dancers at
    // eight couples and 20 at twelve, which is every dancer who is not standing
    // out — because the couple you face is the couple you face. Every one of
    // the 48 others is `N2`, `N3` or `N4`, and the 48 silences are the same
    // rows running off the end of the line. **The couple one couple place along
    // is never the couple you meet next**, at any k, at either length: the two
    // lines slide past each other two couple places a time through, so a
    // one-place step and the hall's own progression never coincide. That is the
    // measurement FR-C1's report is about; the word `N2` is the caller's, and
    // this test is what it costs. Duple improper is untouched by this milestone
    // and is here as the control: still never the wrong dancer, still silent at
    // `N3` and beyond (M8b's known gap, 32 cases).
    expect(counted).toEqual({
      becket: { same: 32, other: 48, silent: 48 },
      "duple-improper": { same: 112, other: 0, silent: 32 },
    });
  });

  /**
   * **Which couple `N2` is, in words, at 4, 6 and 8 couples, for a dancer of
   * each role** — the test FR-C1's brief asks for, and the one that would catch
   * a flipped sign that every count above would sail through.
   *
   * A becket set is laid out with its two lines **offset by one couple place**:
   * line 0 (the couples travelling `+1`, which slide toward the top) reaches
   * from place `−1` to place `places − 1`, and line 1 from place `0` to
   * `places`, because the couple standing out at each end is beyond the far end
   * of the *other* line. A becket couple slides to its own left, which is
   * `place − direction`, so the couple `N2` names is the one across the set at
   * `place − direction` — and at the end of the line that place is off the
   * lattice and `N2` names nobody, which is what the row below says in words.
   */
  it("names N2 in words: the couple across and one place the way you are going", () => {
    /** Where a dancer stands, as a caller would say it. */
    const where = (model: ReturnType<typeof modelAnd>["model"], id: string): string => {
      const d = model.dancers[id];
      if (d === undefined) return "nobody";
      const place = Math.floor(d.slot.position / 2);
      return `${d.role} of the couple at place ${String(place)} on line ${String(d.slot.line)}`;
    };
    const said: Record<string, string> = {};
    for (const couples of [4, 6, 8]) {
      const { model } = modelAnd(BECKET, couples);
      // Both roles of the first three couples that are not standing out at the
      // top: `c1` and `c2` are the four dancing at place 0, one couple from
      // each line, and `c3` is the next couple along (line 0 where the set is
      // long enough to have one, the couple standing out at the bottom at four).
      for (const who of [
        "set0/c1/lark",
        "set0/c1/robin",
        "set0/c2/lark",
        "set0/c2/robin",
        "set0/c3/lark",
        "set0/c3/robin",
      ]) {
        if (model.dancers[who] === undefined) continue;
        const n2 = relate(model, setRulesFor(BECKET).relations, who, parseRelation("N2"));
        said[`${String(couples)}c ${where(model, who)}`] =
          n2 === undefined ? "nobody" : where(model, n2);
      }
    }
    expect(said).toEqual({
      // **Four couples: nobody has an N2 at all.** One four dances, at place 0,
      // and both of its couples are at the end of their own line's reach — the
      // only couples across the set from them are the two standing out, and
      // those are beyond the far end, not one place along. A four-couple becket
      // hall has no diagonal in it, and a dance that calls one leaves everybody
      // on hold-place.
      "4c lark of the couple at place 0 on line 0": "nobody",
      "4c robin of the couple at place 0 on line 0": "nobody",
      "4c lark of the couple at place 0 on line 1": "nobody",
      "4c robin of the couple at place 0 on line 1": "nobody",
      "4c lark of the couple at place 1 on line 1": "nobody",
      "4c robin of the couple at place 1 on line 1": "nobody",
      // **Six couples: the diagonal closes in the middle of the set.** Line 0
      // slides toward the top, so the couple at place 1 looks across to place
      // 0; line 1 slides the other way, so the couple at place 0 looks across
      // to place 1. They are the two ends of the same diagonal, which is what
      // makes the row its own inverse. The couple at the top of line 0 still
      // has nobody: it is at the end of its own line's travel.
      "6c lark of the couple at place 0 on line 0": "nobody",
      "6c robin of the couple at place 0 on line 0": "nobody",
      "6c lark of the couple at place 0 on line 1": "robin of the couple at place 1 on line 0",
      "6c robin of the couple at place 0 on line 1": "lark of the couple at place 1 on line 0",
      "6c lark of the couple at place 1 on line 0": "robin of the couple at place 0 on line 1",
      "6c robin of the couple at place 1 on line 0": "lark of the couple at place 0 on line 1",
      // **Eight couples: word for word the same**, because the answer is a
      // couple place away and not a fraction of the set. Only how many couples
      // have one grows with the line.
      "8c lark of the couple at place 0 on line 0": "nobody",
      "8c robin of the couple at place 0 on line 0": "nobody",
      "8c lark of the couple at place 0 on line 1": "robin of the couple at place 1 on line 0",
      "8c robin of the couple at place 0 on line 1": "lark of the couple at place 1 on line 0",
      "8c lark of the couple at place 1 on line 0": "robin of the couple at place 0 on line 1",
      "8c robin of the couple at place 1 on line 0": "lark of the couple at place 0 on line 1",
    });
  });

  /**
   * **Only the end couples lack an `N2` on a bare lattice** — the roadmap's own
   * count test for FR-C1, exhibited rather than implied by a number.
   *
   * "End" means the end of your own line's reach toward the couple you are
   * progressing to: line 0 slides toward the top, so its two topmost couples
   * (the one standing out at place `−1` and the one dancing at place `0`) have
   * no couple across and one place further up; line 1 slides the other way, so
   * its two bottom couples are the ones without. Everybody in between has one.
   */
  it("only the couples at the ends of a bare becket lattice lack an N2", () => {
    for (const couples of [6, 8, 12]) {
      const { model } = modelAnd(BECKET, couples);
      const without = Object.values(model.dancers)
        .filter(
          (d) =>
            relate(model, setRulesFor(BECKET).relations, d.id, parseRelation("N2")) === undefined,
        )
        .map((d) => ({ line: d.slot.line, place: Math.floor(d.slot.position / 2) }));
      const places = Math.floor((couples - 1) / 2);
      for (const { line, place } of without) {
        const atMyEnd = line === 0 ? place <= 0 : place >= places - 1;
        expect(atMyEnd, `${String(couples)}c line ${String(line)} place ${String(place)}`).toBe(
          true,
        );
      }
      // Two couples at each end of the set, four dancers each.
      expect(without.length, `${String(couples)} couples`).toBe(8);
    }
  });

  it("answers `self` without asking the table at all", () => {
    const { model, table } = modelAnd(BECKET, 6);
    const me = Object.keys(model.dancers)[0]!;
    expect(relate(model, table, me, { kind: "self" })).toBe(me);
  });
});
