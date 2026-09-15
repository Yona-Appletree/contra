import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import { swing } from "../../figures/swing.js";
import type { CompareCase } from "../compareFigures.js";
import { DD21_TOLERANCE } from "../compareFigures.js";
import { gathererGolden, worstOf } from "./gatherers.js";
import { swingDefinition } from "./swing.js";

/**
 * **DD21 (Q4): the swing's geometry is a golden.**
 *
 * The turn rate, the 30° body turn, the hand offsets and the end spacing are
 * protected as numbers rather than as code, so that the data swing may be
 * rewritten as often as it likes and the swing itself may not change.
 */

/** The coded swing's own test's cases, and the two a dance actually calls. */
const CASES: readonly CompareCase[] = [
  { params: { pairs: "neighbors" } },
  { params: { pairs: "partners" } },
  { params: { pairs: "neighbors", turns: 3 } },
  { params: { pairs: "neighbors", handOffset: 3 } },
  // "Open out facing down the hall" is a real thing to ask a duple improper
  // pair, whose own two places lie across the hall. Asked of a *becket* pair,
  // whose places lie along it, it names no pair of places at all: the coded
  // swing answers with the 32 px end spacing of the two dancers *across* the
  // set, which is not an end any swing has, and the data swing settles on to
  // those places instead of opening out about the pair. Neither answer is
  // right and no dance asks the question, so the case is duple improper's.
  { params: { pairs: "partners", endFacing: "down" }, formations: [DUPLE_IMPROPER] },
];

const GOLDEN = gathererGolden(swing, swingDefinition, CASES);

describe("the swing as data", () => {
  it("is data: it survives a round trip through JSON", () => {
    expect(JSON.parse(JSON.stringify(swingDefinition))).toEqual(swingDefinition);
  });

  it("keeps the coded swing's call, count and lead", () => {
    expect(swingDefinition.call).toBe(swing.call);
    expect(swingDefinition.lead).toBe(swing.lead);
    expect(swingDefinition.nominalBeats).toBe(swing.beats);
    expect(swingDefinition.id).toBe(swing.id);
  });

  it("no longer takes `endHalf`, because it no longer guesses (AC2)", () => {
    expect(swing.defaults).toHaveProperty("endHalf");
    expect(swingDefinition.params).toEqual({
      kind: "canonical",
      defaults: { pairs: "neighbors", turns: 2, handOffset: 5, endFacing: "across" },
    });
  });

  for (const result of GOLDEN.stations) {
    it(`is the coded swing, from the stations — ${result.formation} ${JSON.stringify(result.params)}`, () => {
      expect(result.problems).toEqual([]);
      expect(result.samples).toBeGreaterThan(0);
      expect(result.holdPlace).toEqual([]);
    });
  }

  it(`agrees with the coded swing from the stations to ${String(DD21_TOLERANCE.px)} px and ${String(DD21_TOLERANCE.deg)}°`, () => {
    const worst = worstOf(GOLDEN.stations);
    expect(worst.samples).toBeGreaterThan(2000);
    expect(worst.position).toBeLessThan(DD21_TOLERANCE.px);
    expect(worst.facing).toBeLessThan(DD21_TOLERANCE.deg);
    expect(worst.hand).toBeLessThan(DD21_TOLERANCE.px);
  });

  it("settles on the formation's own places even when the figure before did not", () => {
    // The honest end, positively stated. Displaced by a few px and a few
    // degrees, the coded swing opens out about wherever the pair met; this one
    // puts them on the places the next figure starts from, which is what makes
    // Butter's `endHalf: 10` unnecessary.
    const worst = worstOf(GOLDEN.displaced);
    expect(worst.home).toBeLessThan(1e-9);
    // And it really was a different figure: if the displaced run matched the
    // coded one everywhere, the honest end would not be doing anything.
    expect(worst.position).toBeGreaterThan(DD21_TOLERANCE.px);
  });
});
