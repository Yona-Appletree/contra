import { describe, expect, it } from "vitest";
import type { CompareCase } from "../compareFigures.js";
import { DD21_TOLERANCE } from "../compareFigures.js";
import { allemandeDefinition } from "./allemande.js";
import { fixtureOf } from "./fixtureFile.js";
import { gathererGolden, worstOf } from "./gatherers.js";

/**
 * **The allemande as data**, against the coded allemande it replaces.
 *
 * The same `orbitPair` shape a swing dances, so the same golden: from the
 * stations the two are one figure, in both formations, over every parameter
 * case the coded allemande's own test runs.
 *
 * Its two same-role cases are the ones the corpus actually writes — "larks
 * allemande left one and a half", `pairs: [["1L","2L"]]` — and they are also
 * the first figure in the library where **resolution leaves somebody out**: the
 * two robins are not in the figure at all and dance hold-place, which is what
 * they really do. That is an allowed difference, stated per case, because the
 * coded allemande keeps them in its own event standing still.
 */

const CASES: readonly CompareCase[] = [
  { params: { pairs: "neighbors" } },
  { params: { pairs: "partners", hand: "R", amount: 1.5 } },
  { params: { pairs: "neighbors", amount: 2 } },
  { params: { pairs: "neighbors", inward: 20, holdDrop: 4 } },
  {
    params: { pairs: [["1L", "2L"]], hand: "L", amount: 1.5 },
    allowed: ["holdPlace"],
  },
  {
    params: { pairs: [["1R", "2R"]], hand: "R", amount: 1.5 },
    allowed: ["holdPlace"],
  },
];

/** The coded figure this definition replaced, as M11 recorded it. */
const CODED = fixtureOf("allemande");

const GOLDEN = gathererGolden(CODED, allemandeDefinition, CASES);

describe("the allemande as data", () => {
  it("is data: it survives a round trip through JSON", () => {
    expect(JSON.parse(JSON.stringify(allemandeDefinition))).toEqual(allemandeDefinition);
  });

  it("keeps the coded allemande's call, count and lead", () => {
    expect(allemandeDefinition.call).toBe(CODED.call);
    expect(allemandeDefinition.lead).toBe(CODED.lead);
    expect(allemandeDefinition.nominalBeats).toBe(CODED.beats);
  });

  it("no longer takes `endHalf`, because it no longer guesses", () => {
    expect(CODED.defaults).toHaveProperty("endHalf");
    expect(allemandeDefinition.params).toEqual({
      kind: "canonical",
      defaults: { pairs: "neighbors", hand: "L", amount: 1, inward: 45, holdDrop: 2 },
    });
  });

  it("has symmetric roles, because larks allemande larks", () => {
    expect(allemandeDefinition.roles).toEqual(["a", "b"]);
  });

  for (const result of GOLDEN.stations) {
    it(`is the coded allemande, from the stations — ${result.formation} ${JSON.stringify(result.params)}`, () => {
      expect(result.problems).toEqual([]);
      expect(result.samples).toBeGreaterThan(0);
    });
  }

  it(`agrees with the coded allemande from the stations to ${String(DD21_TOLERANCE.px)} px`, () => {
    const worst = worstOf(GOLDEN.stations);
    expect(worst.samples).toBeGreaterThan(2000);
    expect(worst.position).toBeLessThan(DD21_TOLERANCE.px);
    expect(worst.facing).toBeLessThan(DD21_TOLERANCE.deg);
    expect(worst.hand).toBeLessThan(DD21_TOLERANCE.px);
  });

  it("leaves the dancers the pairing left out to dance hold-place", () => {
    const sameRole = GOLDEN.stations.filter((r) => Array.isArray(r.params["pairs"]));
    expect(sameRole.length).toBeGreaterThan(0);
    for (const result of sameRole) expect(result.holdPlace).toHaveLength(2);
    for (const result of GOLDEN.stations.filter((r) => !Array.isArray(r.params["pairs"]))) {
      expect(result.holdPlace).toEqual([]);
    }
  });

  it("takes its end spacing from the formation's places, not from a guess", () => {
    // The allemande gathers less than a swing does: it keeps the direction the
    // turn stopped on and reads only how far out to stand off the set's own
    // places, which is the whole of what `endHalf` was ever written to say.
    // Settling the *point* as well is owed — see the M2 report — and is a look
    // decision for G1 rather than something to guess at here.
    expect(allemandeDefinition.ends).toBe("home");
    const worst = worstOf(GOLDEN.displaced);
    expect(worst.home).toBeGreaterThan(0);
    expect(worst.home).toBeLessThan(5);
  });
});
