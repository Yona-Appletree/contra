import { describe, expect, it } from "vitest";
import { balanceRing } from "../../figures/balance.js";
import type { CompareCase } from "../compareFigures.js";
import { DD21_TOLERANCE } from "../compareFigures.js";
import { balanceRingDefinition } from "./balance-ring.js";
import { gathererGolden, worstOf } from "./gatherers.js";

/**
 * **The balance of the ring as data**, against the coded one it replaces.
 *
 * A ring that opens back out is a gatherer, and the only one in this milestone
 * that gathers **four** dancers rather than a pair: each of them takes one of
 * the formation's places, and which takes which is the assignment nobody
 * crosses anybody in.
 */

const CASES: readonly CompareCase[] = [
  { params: {} },
  { params: { rock: 2 } },
  { params: { holdDrop: 4, stackPx: 0 } },
  // A ring that stays closed up has not gathered anybody: it ends on the ring,
  // where the figure that follows takes it over.
  { params: { openOut: false } },
];

const GOLDEN = gathererGolden(balanceRing, balanceRingDefinition, CASES);

describe("the balance of the ring as data", () => {
  it("is data: it survives a round trip through JSON", () => {
    expect(JSON.parse(JSON.stringify(balanceRingDefinition))).toEqual(balanceRingDefinition);
  });

  it("keeps the coded figure's call, count, lead and defaults", () => {
    expect(balanceRingDefinition.call).toBe(balanceRing.call);
    expect(balanceRingDefinition.lead).toBe(balanceRing.lead);
    expect(balanceRingDefinition.nominalBeats).toBe(balanceRing.beats);
    const coded = { ...(balanceRing.defaults as Record<string, unknown>) };
    delete coded["from"];
    delete coded["carried"];
    expect(balanceRingDefinition.params).toEqual({ kind: "canonical", defaults: coded });
  });

  it("takes the whole ring in one instance, anchored on its centroid", () => {
    expect(balanceRingDefinition.actors).toBe("ring");
    expect(balanceRingDefinition.anchor).toBe("centroid");
    expect(balanceRingDefinition.roles).toEqual(["a", "b", "c", "d"]);
  });

  for (const result of GOLDEN.stations) {
    it(`is the coded figure, from the stations — ${result.formation} ${JSON.stringify(result.params)}`, () => {
      expect(result.problems).toEqual([]);
      expect(result.samples).toBeGreaterThan(0);
      expect(result.holdPlace).toEqual([]);
    });
  }

  it(`agrees with the coded figure from the stations to ${String(DD21_TOLERANCE.px)} px`, () => {
    const worst = worstOf(GOLDEN.stations);
    expect(worst.samples).toBeGreaterThan(1000);
    expect(worst.position).toBeLessThan(DD21_TOLERANCE.px);
    expect(worst.facing).toBeLessThan(DD21_TOLERANCE.deg);
    expect(worst.hand).toBeLessThan(DD21_TOLERANCE.px);
  });

  it("opens back out on to the set's own places, not on to where it closed up", () => {
    const opening = GOLDEN.displaced.filter((r) => r.params["openOut"] !== false);
    expect(opening.length).toBeGreaterThan(0);
    expect(worstOf(opening).home).toBeLessThan(1e-9);
    // Displaced, that really is somewhere else: the coded ring goes back to
    // wherever each dancer was standing when the rock began.
    expect(worstOf(opening).position).toBeGreaterThan(DD21_TOLERANCE.px);
  });
});
