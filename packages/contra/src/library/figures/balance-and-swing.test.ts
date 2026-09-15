import { describe, expect, it } from "vitest";
import { balanceAndSwing } from "../../figures/balance-and-swing.js";
import { DUPLE_IMPROPER } from "../../formation/dupleImproper.js";
import { probeGroup } from "../../figures/testing.js";
import { createGroup, withDefaults } from "@caller/choreo";
import type { CompareCase } from "../compareFigures.js";
import { DD21_TOLERANCE } from "../compareFigures.js";
import { interpretDefinition } from "../interpret.js";
import { balanceAndSwingDefinition } from "./balance-and-swing.js";
import { gathererGolden, worstOf } from "./gatherers.js";

/**
 * **Balance and swing as data**: one call, one figure, and the seam in the
 * middle of it gone.
 *
 * Besides the usual golden, this is where the `sequence` kind is held to its
 * promise: the hold the rock takes is **never let go** — the lark's left in the
 * robin's right is one joined floor point from the beat the balance takes it
 * until the pair opens out — and the other two hands travel from the rock's
 * second hold to the back and the shoulder rather than dropping to the hip and
 * coming back up.
 */

const CASES: readonly CompareCase[] = [
  { params: { pairs: "neighbors" } },
  { params: { pairs: "partners" } },
  { params: { pairs: "neighbors", balanceBeats: 6 } },
  { params: { pairs: "partners", turns: 3, handOffset: 3 } },
];

const GOLDEN = gathererGolden(balanceAndSwing, balanceAndSwingDefinition, CASES);

describe("balance and swing as data", () => {
  it("is data: it survives a round trip through JSON", () => {
    expect(JSON.parse(JSON.stringify(balanceAndSwingDefinition))).toEqual(
      balanceAndSwingDefinition,
    );
  });

  it("keeps the coded figure's call, count and lead", () => {
    expect(balanceAndSwingDefinition.call).toBe(balanceAndSwing.call);
    expect(balanceAndSwingDefinition.lead).toBe(balanceAndSwing.lead);
    expect(balanceAndSwingDefinition.nominalBeats).toBe(balanceAndSwing.beats);
  });

  it("is a sequence of the rock and the orbit the other two definitions are", () => {
    const shape = balanceAndSwingDefinition.shape;
    if (shape.kind !== "sequence") throw new Error(`expected a sequence, got "${shape.kind}"`);
    expect(shape.parts.map((p) => p.shape.kind)).toEqual(["rock", "orbitPair"]);
    expect(shape.parts[1]!.beats).toBe("rest");
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
    expect(worst.samples).toBeGreaterThan(4000);
    expect(worst.position).toBeLessThan(DD21_TOLERANCE.px);
    expect(worst.facing).toBeLessThan(DD21_TOLERANCE.deg);
    expect(worst.hand).toBeLessThan(DD21_TOLERANCE.px);
  });

  it("settles the pair on to the formation's own places (AC2's mechanism)", () => {
    expect(worstOf(GOLDEN.displaced).home).toBeLessThan(1e-9);
  });

  it("never lets go of the hold the rock took", () => {
    // The whole reason the figure exists. One join, held continuously from the
    // beat the balance has it to the beat the swing opens out — no gap, and no
    // moment where the two dancers' hands are two points instead of one.
    const fig = interpretDefinition(balanceAndSwingDefinition);
    const plan = fig.plan(
      planContextOf(),
      withDefaults(fig, { pairs: "neighbors" }, balanceAndSwingDefinition.nominalBeats),
    );
    const beats = balanceAndSwingDefinition.nominalBeats;
    const held: number[] = [];
    for (let t = 0; t <= beats; t += 1 / 8) {
      const joins = plan.joinsAt(t).map((j) => `${j.a}.${j.aSide}/${j.b}.${j.bSide}`);
      if (joins.includes("lark.L/robin.R")) held.push(t);
    }
    expect(held.length).toBeGreaterThan(0);
    // One unbroken run, not two.
    for (let i = 1; i < held.length; i++) {
      expect(held[i]! - held[i - 1]!, `a gap at beat ${String(held[i])}`).toBeCloseTo(1 / 8, 9);
    }
    // And it is still held while the *turn* is running, not only the rock.
    expect(Math.max(...held)).toBeGreaterThan(balanceAndSwingDefinition.nominalBeats / 2);
  });
});

/** The plan context of one instance of the figure, cast lark and robin. */
function planContextOf() {
  const group = probeGroup(DUPLE_IMPROPER);
  const pair = createGroup(
    {
      id: "pair",
      kind: "set",
      frame: group.frame,
      stations: [
        { id: "lark", role: "lark", p: [16, -10], facing: 90 },
        { id: "robin", role: "robin", p: [16, 10], facing: 270 },
      ],
      members: { lark: "d/lark", robin: "d/robin" },
      couples: [],
    },
    DUPLE_IMPROPER.roleSet,
  );
  return {
    stations: pair.stations,
    ids: pair.stations.map((s) => s.id),
    roleSet: pair.roleSet,
    spacing: pair.frame.spacing,
    start: Object.fromEntries(pair.stations.map((s) => [s.id, { p: s.p, facing: s.facing }])),
    spot: (id: string) => {
      const found = pair.stations.find((s) => s.id === id);
      if (!found) throw new Error(`no station "${id}"`);
      return { p: found.p, facing: found.facing };
    },
    role: (id: string) => {
      const found = pair.stations.find((s) => s.id === id);
      if (!found) throw new Error(`no station "${id}"`);
      return found.role;
    },
  };
}
