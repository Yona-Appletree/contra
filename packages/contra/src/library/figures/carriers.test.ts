import { describe, expect, it } from "vitest";
import type { ContraFigure } from "../../figures/ContraFigure.js";
import { californiaTwirl } from "../../figures/california-twirl.js";
import { circle } from "../../figures/circle.js";
import { doSiDo } from "../../figures/do-si-do.js";
import { longLines } from "../../figures/long-lines.js";
import { passThrough } from "../../figures/pass-through.js";
import { petronella } from "../../figures/petronella.js";
import { rightAndLeftThrough } from "../../figures/right-and-left-through.js";
import { robinsChain } from "../../figures/robins-chain.js";
import { rollAway } from "../../figures/roll-away.js";
import { slideLeft } from "../../figures/slide-left.js";
import { star } from "../../figures/star.js";
import type { CompareCase } from "../compareFigures.js";
import type { FigureDefinition } from "../FigureDefinition.js";
import { CARRIER_DEFINITIONS } from "./index.js";
import { bothWays, carrierGolden, worstOf } from "./carriers.js";

/**
 * **The eleven carriers as data**, each against the coded figure it replaces.
 *
 * DD21's method, with DD21's tolerance, and — this is the whole difference from
 * the five gatherers M2 migrated — **no allowed difference anywhere**. A
 * gatherer settles on to the formation's own places, so once the dancers are
 * off theirs it is *meant* to end somewhere the coded figure did not. A carrier
 * has no such licence: its ends are a function of where the dancers stand, so
 * it has to agree from the stations and displaced alike, and a difference is a
 * bug in one of the two rather than a look decision.
 *
 * All eleven agree **exactly** — 0 px, 0°, 0 px of hand, not "inside the
 * tolerance" — which is worth saying plainly: the definitions are not a
 * re-derivation of the coded geometry to a few decimal places, they run the
 * same arithmetic in the same order through a shape kind instead of a closure.
 *
 * Both formations, because "across" means the opposite thing in the two and a
 * figure that only works in one has not been migrated.
 */

/** One figure's whole gate: the four claims, then its own cases. */
function carrier(
  coded: ContraFigure,
  definition: FigureDefinition,
  cases: readonly CompareCase[],
  least: number,
): void {
  const all = bothWays(carrierGolden(coded, definition, cases));

  it("is data: it survives a round trip through JSON", () => {
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });

  it("keeps the coded figure's call, count, lead and defaults", () => {
    expect(definition.call).toBe(coded.call);
    expect(definition.lead).toBe(coded.lead);
    expect(definition.nominalBeats).toBe(coded.beats);
    const defaults = { ...(coded.defaults as Record<string, unknown>) };
    delete defaults["from"];
    delete defaults["carried"];
    expect(definition.params).toEqual({ kind: "canonical", defaults });
  });

  it("carries the whole minor set in one instance and leaves it where it put it", () => {
    expect(definition.actors).toBe("all");
    expect(definition.ends).toBe("relative");
  });

  for (const result of all) {
    const from = result.from === "stations" ? "the stations" : "displaced";
    it(`is the coded figure, ${from} — ${result.formation} ${JSON.stringify(result.params)}`, () => {
      expect(result.problems).toEqual([]);
      expect(result.samples).toBeGreaterThan(0);
      expect(result.holdPlace).toEqual([]);
    });
  }

  it("is the coded figure to the last pixel, wherever the dancers start", () => {
    const worst = worstOf(all);
    expect(worst.samples).toBeGreaterThan(least);
    expect(worst.position).toBe(0);
    expect(worst.facing).toBe(0);
    expect(worst.hand).toBe(0);
  });
}

describe("the circle as data", () => {
  carrier(
    circle,
    findDefinition("circle"),
    [
      { params: {} },
      { params: { places: 4 } },
      { params: { direction: "right" } },
      { params: { holdDrop: 3, stackPx: 0 } },
    ],
    4000,
  );
});

describe("the star as data", () => {
  carrier(
    star,
    findDefinition("star"),
    [
      { params: {} },
      { params: { hand: "L" } },
      { params: { places: 2 } },
      // The other hold, which some halls rarely call for: two joined points at
      // the middle instead of four hands on four wrists.
      { params: { hold: "hands-across" } },
      { params: { hold: "hands-across", hand: "L" } },
      { params: { holdDrop: 6, stackPx: 0 } },
    ],
    6000,
  );
});

describe("long lines as data", () => {
  carrier(
    longLines,
    findDefinition("long-lines"),
    [{ params: {} }, { params: { forwardPx: 6 } }, { params: { holdDrop: 4, stackPx: 0 } }],
    3000,
  );
});

describe("the do-si-do as data", () => {
  carrier(
    doSiDo,
    findDefinition("do-si-do"),
    [
      { params: {} },
      { params: { pairs: "partners" } },
      { params: { amount: 1.5 } },
      { params: { passPx: 3 } },
      // "Robins right shoulder round once and a half": the two larks stand
      // still at the corners and the ellipse has to clear them, which is why
      // this figure takes the whole minor set rather than one instance a pair.
      { params: { pairs: [["1R", "2R"]] } },
      { params: { endHalf: 12 } },
    ],
    6000,
  );
});

describe("the pass through as data", () => {
  carrier(
    passThrough,
    findDefinition("pass-through"),
    [{ params: {} }, { params: { direction: "along" } }, { params: { bowPx: 0 } }],
    1500,
  );
});

describe("the petronella as data", () => {
  carrier(
    petronella,
    findDefinition("petronella"),
    [{ params: {} }, { params: { places: 2 } }, { params: { spins: 2 } }, { params: { bowPx: 0 } }],
    2000,
  );
});

describe("the slide left as data", () => {
  carrier(
    slideLeft,
    findDefinition("slide-left"),
    [{ params: {} }, { params: { direction: -1 } }, { params: { alongPx: 10 } }],
    1500,
  );
});

describe("the roll away as data", () => {
  carrier(
    rollAway,
    findDefinition("roll-away"),
    [
      { params: {} },
      { params: { roller: "lark" } },
      { params: { spins: 2, bowPx: 2 } },
      // A pairing that leaves two dancers out. They are still *in* the figure —
      // the coded one rocks and spins them on the spot with their hands down,
      // and so does this.
      { params: { pairs: [["1L", "1R"]] } },
    ],
    2000,
  );
});

describe("the california twirl as data", () => {
  carrier(
    californiaTwirl,
    findDefinition("california-twirl"),
    [
      { params: {} },
      { params: { direction: -1 } },
      { params: { pairs: [["1L", "1R"]] } },
      { params: { holdDrop: 3 } },
    ],
    2000,
  );
});

describe("right and left through as data", () => {
  carrier(
    rightAndLeftThrough,
    findDefinition("right-and-left-through"),
    [
      { params: {} },
      { params: { couples: "neighbors" } },
      { params: { passBeats: 4 } },
      { params: { pivotFromLark: 5 } },
      { params: { holdDrop: 4, stackPx: 0, bowPx: 0 } },
    ],
    5000,
  );
});

describe("the robins chain as data", () => {
  carrier(
    robinsChain,
    findDefinition("robins-chain"),
    [
      { params: {} },
      { params: { joinBeat: 3 } },
      { params: { passPx: 3 } },
      { params: { holdDrop: 4, stackPx: 0 } },
    ],
    4000,
  );
});

describe("the carriers, as a list", () => {
  it("is the eleven figures M4 migrated, and no others", () => {
    expect(CARRIER_DEFINITIONS.map((def) => def.id).sort()).toEqual([
      "california-twirl",
      "circle",
      "do-si-do",
      "long-lines",
      "pass-through",
      "petronella",
      "right-and-left-through",
      "robins-chain",
      "roll-away",
      "slide-left",
      "star",
    ]);
  });

  it("gives every one of them a golden above", () => {
    // The `describe` blocks are what run the comparisons; this is the guard
    // that a definition cannot be added to the list and quietly go untested.
    const tested = new Set(Object.keys(GOLDENS));
    expect([...CARRIER_DEFINITIONS].map((def) => def.id).filter((id) => !tested.has(id))).toEqual(
      [],
    );
  });
});

/** Which figure ids have a `describe` block above; see the guard. */
const GOLDENS: Readonly<Record<string, true>> = {
  circle: true,
  star: true,
  "long-lines": true,
  "do-si-do": true,
  "pass-through": true,
  petronella: true,
  "slide-left": true,
  "roll-away": true,
  "california-twirl": true,
  "right-and-left-through": true,
  "robins-chain": true,
};

/** One carrier's definition, by id. */
function findDefinition(id: string): FigureDefinition {
  const def = CARRIER_DEFINITIONS.find((each) => each.id === id);
  if (!def) throw new Error(`no carrier definition "${id}"`);
  return def;
}
