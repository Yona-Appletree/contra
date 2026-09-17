import { describe, expect, it } from "vitest";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import { swing } from "../../figures/swing.js";
import type { CompareCase } from "../compareFigures.js";
import { DD13_SWING_TOLERANCE } from "../compareFigures.js";
import { gathererGolden, worstOf } from "./gatherers.js";
import { swingDefinition } from "./swing.js";

/**
 * **DD21 (Q4): the swing's geometry is a golden.**
 *
 * The turn rate, the 30° body turn, the hand offsets and the end spacing are
 * protected as numbers rather than as code, so that the data swing may be
 * rewritten as often as it likes and the swing itself may not change.
 */

/**
 * The coded swing's own test's cases, and the two a dance actually calls.
 *
 * Every one of them allows `"feet"` since M10: the definition's orbit places
 * its walking feet with the **planted gait** — a foot on the floor, held while
 * the body turns over it, swinging through in the last half beat — and the
 * coded swing it is compared against still slides them on a body-local sine,
 * because the coded layer is deliberately not retrofitted (M11 deletes it).
 * Everything DD21 is actually about is unchanged and still asserted: the turn
 * rate, the 30° body turn, the hand offsets and the end spacing — at DD13's
 * 1 px and 1° since M11 (the user at G1: "seems kinda intense. maybe like
 * 1px?"), against the coded swing **as recorded** rather than as run, because
 * M11 deleted it. The measured worst is far under that ceiling. The
 * buzz step itself is unchanged — the fade into it is the same `lerpFeet` — so
 * the two agree again as soon as the buzz has taken the feet over.
 */
const CASES: readonly CompareCase[] = [
  { params: { pairs: "neighbors" }, allowed: ["feet"] },
  { params: { pairs: "partners" }, allowed: ["feet"] },
  { params: { pairs: "neighbors", turns: 3 }, allowed: ["feet"] },
  { params: { pairs: "neighbors", handOffset: 3 }, allowed: ["feet"] },
  // "Open out facing down the hall" is a real thing to ask a duple improper
  // pair, whose own two places lie across the hall. Asked of a *becket* pair,
  // whose places lie along it, it names no pair of places at all: the coded
  // swing answers with the 32 px end spacing of the two dancers *across* the
  // set, which is not an end any swing has, and the data swing settles on to
  // those places instead of opening out about the pair. Neither answer is
  // right and no dance asks the question, so the case is duple improper's.
  {
    params: { pairs: "partners", endFacing: "down" },
    formations: [DUPLE_IMPROPER],
    allowed: ["feet"],
  },
];

const GOLDEN = gathererGolden(swing, swingDefinition, CASES, DD13_SWING_TOLERANCE);

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

  it(`agrees with the coded swing from the stations to ${String(DD13_SWING_TOLERANCE.px)} px and ${String(DD13_SWING_TOLERANCE.deg)}°`, () => {
    const worst = worstOf(GOLDEN.stations);
    expect(worst.samples).toBeGreaterThan(2000);
    expect(worst.position).toBeLessThan(DD13_SWING_TOLERANCE.px);
    expect(worst.facing).toBeLessThan(DD13_SWING_TOLERANCE.deg);
    expect(worst.hand).toBeLessThan(DD13_SWING_TOLERANCE.px);
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
    expect(worst.position).toBeGreaterThan(DD13_SWING_TOLERANCE.px);
  });
});
