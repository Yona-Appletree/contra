import { describe, expect, it } from "vitest";
import { balance } from "../../figures/balance.js";
import type { CompareCase } from "../compareFigures.js";
import { DD21_TOLERANCE } from "../compareFigures.js";
import { balanceDefinition } from "./balance.js";
import { gathererGolden, worstOf } from "./gatherers.js";

/**
 * **The balance as data**, against the coded balance it replaces.
 *
 * The balance is the one migrated figure whose ends are `"relative"` and not
 * `"home"`: it ends where it balanced, facing its partner, closed up for the
 * swing that follows it in every dance in the corpus. So the two agree
 * **everywhere**, displaced or not — the honest-ends treatment changes nothing
 * about a rock, and if it ever did, this test would say so.
 */

/** The coded balance's own parameter cases, and both pairings. */
const CASES: readonly CompareCase[] = [
  { params: { pairs: "neighbors" } },
  { params: { pairs: "partners" } },
  { params: { pairs: "neighbors", hold: "one", hand: "R" } },
  { params: { pairs: "neighbors", hold: "one", hand: "L" } },
  { params: { pairs: "neighbors", hold: "none" } },
  { params: { pairs: "neighbors", rock: 2, holdDrop: 3, stackPx: 0 } },
];

const GOLDEN = gathererGolden(balance, balanceDefinition, CASES);

describe("the balance as data", () => {
  it("is data: it survives a round trip through JSON", () => {
    expect(JSON.parse(JSON.stringify(balanceDefinition))).toEqual(balanceDefinition);
  });

  it("keeps the coded balance's call, count, lead and defaults", () => {
    expect(balanceDefinition.call).toBe(balance.call);
    expect(balanceDefinition.lead).toBe(balance.lead);
    expect(balanceDefinition.nominalBeats).toBe(balance.beats);
    // The coded figure's own defaults, minus the two the chain threads.
    const coded = { ...(balance.defaults as Record<string, unknown>) };
    delete coded["from"];
    delete coded["carried"];
    expect(balanceDefinition.params).toEqual({ kind: "canonical", defaults: coded });
  });

  it("ends where it balanced, which is what the swing that follows wants", () => {
    expect(balanceDefinition.ends).toBe("relative");
  });

  for (const result of [...GOLDEN.stations, ...GOLDEN.displaced]) {
    it(`is the coded balance — ${result.formation} ${result.from} ${JSON.stringify(result.params)}`, () => {
      expect(result.problems).toEqual([]);
      expect(result.samples).toBeGreaterThan(0);
      expect(result.holdPlace).toEqual([]);
    });
  }

  it("agrees with the coded balance everywhere, not only from the stations", () => {
    const worst = worstOf([...GOLDEN.stations, ...GOLDEN.displaced]);
    expect(worst.samples).toBeGreaterThan(2000);
    expect(worst.position).toBeLessThan(DD21_TOLERANCE.px);
    expect(worst.facing).toBeLessThan(DD21_TOLERANCE.deg);
    expect(worst.hand).toBeLessThan(DD21_TOLERANCE.px);
  });
});
