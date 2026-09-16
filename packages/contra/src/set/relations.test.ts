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
   * Becket, six couples, as FR-C2 lays a hall out: both lines start on the same
   * couple places and every couple dances. Line 0 is `c0` at place 0, `c2` at 1
   * and `c4` at 2; line 1 is `c1`, `c3` and `c5` on the same three. A couple
   * occupies two adjacent positions of **one** line, so a couple place is two
   * positions; the two lines slide past each other **two** positions a time
   * through — one couple place — and `N_k` steps two, which is that same couple
   * place, the way your own couple is going (`becket.ts`'s
   * {@link nextNeighbourStep}).
   *
   * So the whole line of neighbours is read off the floor: `N0` is the couple
   * across and one place behind you, `N1` the couple you face, `N2` the couple
   * across and one place ahead, and each one further is one place further, until
   * the count runs off the end of the other line and answers nobody. Both lines
   * hold positions `0 … 5`, so the couple at the top of line 0 has no `N2` and
   * the couple at the bottom of line 1 has none either.
   *
   * Written out for `c0/lark`, at line 0 position 0 travelling `+1`, whose own
   * couple slides toward `−position`:
   *
   * ```text
   *   N_k = line 1, position 0 − 2(k − 1)
   *   k = 0 → 2 (c3/robin)   k = 1 → 0 (c1/robin)   k = 2 → −2 (nobody)
   * ```
   *
   * `shadow` and `trail-buddy` are the two rows still read round the set's own
   * loop, so at the end of a line they wrap round it rather than answering
   * nobody — `c0/lark`'s shadow is the couple across the top of the set.
   */
  const BECKET_ROUND_0: Record<string, Record<string, string | undefined>> = {
    // c0/lark: line 0, position 0, travelling toward the top — the top end of
    // the line, so the couple it is heading for is off the lattice.
    "set0/c0/lark": {
      partner: "set0/c0/robin",
      opposite: "set0/c1/robin",
      N0: "set0/c3/robin",
      N1: "set0/c1/robin",
      N2: undefined,
      N3: undefined,
      N4: undefined,
      shadow: "set0/c1/robin",
      S2: "set0/c3/robin",
      "trail-buddy": "set0/c2/lark",
    },
    // c2/lark: line 0, position 2, travelling toward the top — one place
    // further down, so this one has an `N2`: the couple at place 0 on line 1.
    "set0/c2/lark": {
      partner: "set0/c2/robin",
      opposite: "set0/c3/robin",
      N0: "set0/c5/robin",
      N1: "set0/c3/robin",
      N2: "set0/c1/robin",
      N3: undefined,
      shadow: "set0/c0/robin",
      S2: "set0/c1/robin",
      "trail-buddy": "set0/c4/lark",
    },
    // c3/lark: line 1, position 3, travelling toward the bottom, so its own
    // count runs the other way along the lattice and off the far end.
    "set0/c3/lark": {
      partner: "set0/c3/robin",
      opposite: "set0/c2/robin",
      N0: "set0/c0/robin",
      N1: "set0/c2/robin",
      N2: "set0/c4/robin",
      N3: undefined,
      N4: undefined,
      shadow: "set0/c5/robin",
      S2: "set0/c4/robin",
      "trail-buddy": "set0/c1/lark",
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
   * places a step instead of one. FR-C2 moves the row up by one couple —
   * `8, 6, 4, 2`, duple improper's own numbers — because the two lines now
   * start on the same couple places instead of offset by one, so everybody has
   * an `N1`.
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
      N1: "8/8",
      // One couple place a step (FR-C1), so the row falls away one couple at
      // each end per k, exactly as duple improper's does — a becket line is two
      // straight lines again as far as a neighbour is concerned.
      N2: "6/8",
      N3: "4/8",
      N4: "2/8",
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
   * **FR-C2 is where the two readings became one reading.** The user's ruling
   * (E3, DD49) is that becket's `N2` is the couple across the set and one couple
   * place along — *"your next neighbor"* — and while the model slid a whole
   * couple place a line the hall said otherwise: the couple you faced one
   * progression from now was the couple across and **two** couple places along,
   * because both lines slid a place and they face opposite ways. A half-width
   * slide passes the lines one couple place a time through, so the caller's word
   * and the hall now name the same couple, and this test asserts it rather than
   * counting how far apart they are.
   *
   * Duple improper's row is the control and is untouched: still never the wrong
   * dancer, still silent at `N3` and beyond (M8b's known gap), by the same
   * counts as before.
   */
  it("N_k against the hall: it is who you face k−1 times through, in both formations", () => {
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
            // Neither formation's row may name a dancer the hall does not: both
            // are exactly the hall's own offsets since FR-C2.
            expect.fail(
              `${formation.id} ${String(couples)}c ${dancer.id} N${String(k)}: ` +
                `table says ${said}, the hall says ${String(hall)}`,
            );
          }
        }
      }
      counted[formation.id] = { same, other, silent };
    }
    // **Not one disagreement, in either formation.** `N_k` names the couple you
    // face `k − 1` times through from now wherever the table names anybody at
    // all, which is the claim DD28 was about and the claim FR-C1 had to
    // withdraw. The silences are the rows running off the end of the line — the
    // table answers nobody where the hall, a progression later, has found
    // somebody by turning the set round at an end, which is M8b's known gap and
    // the same in both formations.
    expect(counted).toEqual({
      becket: { same: 112, other: 0, silent: 32 },
      "duple-improper": { same: 112, other: 0, silent: 32 },
    });
  });

  /**
   * **Which couple `N2` is, in words, at 4, 6 and 8 couples, for a dancer of
   * each role** — the test FR-C1's brief asks for, and the one that would catch
   * a flipped sign that every count above would sail through.
   *
   * A becket set is laid out with **both lines on the same couple places**
   * (FR-C2), which is where a hall that has taken hands four and moved one place
   * round stands. A becket couple slides half a place to its own left, so the
   * couple `N2` names is the one across the set at `place − direction` — the
   * couple on your diagonal, and the couple you will be facing the next time
   * through. At the end of your own line's travel that place is off the lattice
   * and `N2` names nobody, which is what the row below says in words.
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
      // Both roles of the first three couples: `c0` and `c1` are the four
      // dancing at place 0, one couple from each line, and `c2` is the next
      // couple along line 0.
      for (const who of [
        "set0/c0/lark",
        "set0/c0/robin",
        "set0/c1/lark",
        "set0/c1/robin",
        "set0/c2/lark",
        "set0/c2/robin",
      ]) {
        if (model.dancers[who] === undefined) continue;
        const n2 = relate(model, setRulesFor(BECKET).relations, who, parseRelation("N2"));
        said[`${String(couples)}c ${where(model, who)}`] =
          n2 === undefined ? "nobody" : where(model, n2);
      }
    }
    expect(said).toEqual({
      // **Four couples now have a diagonal**, where under the whole-place model
      // they had none at all: two fours dance and the couple at place 0 on one
      // line looks across to place 1 on the other. That is FR-C2's most visible
      // consequence for a short hall — a dance that calls a diagonal at four
      // couples used to leave everybody on hold-place.
      "4c lark of the couple at place 0 on line 0": "nobody",
      "4c robin of the couple at place 0 on line 0": "nobody",
      "4c lark of the couple at place 0 on line 1": "robin of the couple at place 1 on line 0",
      "4c robin of the couple at place 0 on line 1": "lark of the couple at place 1 on line 0",
      "4c lark of the couple at place 1 on line 0": "robin of the couple at place 0 on line 1",
      "4c robin of the couple at place 1 on line 0": "lark of the couple at place 0 on line 1",
      // **Six couples: the same words.** Line 0 slides toward the top, so the
      // couple at place 1 looks across to place 0; line 1 slides the other way,
      // so the couple at place 0 looks across to place 1. They are the two ends
      // of the same diagonal, which is what makes the row its own inverse. The
      // couple at the top of line 0 has nobody: it is at the end of its own
      // line's travel.
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
   * progressing to: line 0 slides toward the top, so its own topmost couple has
   * no couple across and one place further up; line 1 slides the other way, so
   * its bottom couple is the one without. Everybody in between has one — which
   * is **one** couple at each end since FR-C2, where the whole-place model left
   * two at each end without (the two lines were offset by a place, so the couple
   * standing out had nobody either).
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
      const lastPlace = Math.ceil(couples / 2) - 1;
      for (const { line, place } of without) {
        const atMyEnd = line === 0 ? place === 0 : place === lastPlace;
        expect(atMyEnd, `${String(couples)}c line ${String(line)} place ${String(place)}`).toBe(
          true,
        );
      }
      // One couple at each end of the set, two dancers each.
      expect(without.length, `${String(couples)} couples`).toBe(4);
    }
  });

  it("answers `self` without asking the table at all", () => {
    const { model, table } = modelAnd(BECKET, 6);
    const me = Object.keys(model.dancers)[0]!;
    expect(relate(model, table, me, { kind: "self" })).toBe(me);
  });
});
