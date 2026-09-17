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
 *
 * ## The figures the user's review has moved (FR-A1)
 *
 * "Agrees with the coded figure" is a claim about the **migration**, not about
 * the dance: it says M4 re-expressed the arithmetic faithfully. Once the user
 * looks at a figure on the Moves page and says it is wrong, the coded twin is
 * wrong in exactly the same way, and the definition is *meant* to leave it
 * behind. Those figures declare a {@link Moved} instead of the zero: the
 * comparison still runs, over the same cases, and what it asserts is **how far
 * the figure has moved, in which of the quantities** — with the user's own
 * words for why. A figure that drifted further than its review asked for still
 * fails, and so does one that quietly drifted back.
 */

/**
 * How far a definition has deliberately moved away from the coded figure it
 * replaces, because the user's review said the coded one was wrong.
 *
 * Every number is the **worst** over every case, both formations, from the
 * stations and displaced — measured, not chosen.
 */
interface Moved {
  /**
   * The user's words, and what changed because of them — or, for the nine
   * figures M10 put on the **cruise**, the ruling and what it moved.
   *
   * A cruised figure's `endPx` and `endDeg` are zero by construction: the
   * profile changes the *pace* along a leg and nothing about where it starts or
   * finishes. What it moves is every sample between the two ends, and the hands
   * that ride the body with them. That is why this number is worth pinning:
   * a definition that quietly stopped cruising would land back on zero here.
   */
  why: string;
  /** The worst body-position difference, px. */
  position: number;
  /** The worst facing (or look) difference, degrees. */
  facing: number;
  /** The worst joined-hand point difference, px. */
  hand: number;
  /** The worst difference in where the figure *leaves* people, px. */
  endPx: number;
  /** …and in the facings it leaves them on, degrees. */
  endDeg: number;
}

/** What M10 did to the nine figures it put on the cruise; see {@link Moved.why}. */
const CRUISE_WHY =
  "M10: the definition rides the **cruise** — a constant-speed trapezoid with ramps of min(1 beat, leg / 4) — where the coded figure still eases on one smoothstep over the whole leg. Peak-over-average speed falls from 1.50x to 1.33x. The two figures start together, finish together and take the same hands on the same beats — both end numbers are exactly zero — and differ only in where along the same path a dancer is at a given beat";

/** One figure's whole gate: the four claims, then its own cases. */
function carrier(
  coded: ContraFigure,
  definition: FigureDefinition,
  cases: readonly CompareCase[],
  least: number,
  moved?: Moved,
): void {
  const measured: readonly CompareCase[] = moved
    ? cases.map((test) => ({
        ...test,
        // `"profile"` is M10's: a definition on the cruise is somewhere else
        // along the *same* path at every sample between the two ends, and so
        // are the hands that ride the body. The ends and the joins are still
        // asserted, by the measured claim below.
        allowed: [...(test.allowed ?? []), "path", "ends", "profile"],
      }))
    : cases;
  const all = bothWays(carrierGolden(coded, definition, measured));

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
    // **Every coded default, with its coded value** — and a definition is
    // allowed to have *more* of them (M8). The star's `amount` is the first: a
    // caller says "star left 7/8" and the coded figure has no word for it, so a
    // record that writes one is a new-engine record by construction. What M4's
    // gate is about is that nothing the coded figure understood has moved, which
    // is what the loop below asserts key by key.
    const declared = definition.params.kind === "canonical" ? definition.params.defaults : {};
    for (const [key, value] of Object.entries(defaults)) {
      expect(declared[key], `${definition.id}.${key}`).toEqual(value);
    }
    expect(definition.params.kind).toBe("canonical");
  });

  it("carries the whole minor set in one instance and leaves it where it put it", () => {
    expect(definition.actors).toBe("all");
    expect(definition.ends).toBe("relative");
  });

  for (const result of all) {
    const from = result.from === "stations" ? "the stations" : "displaced";
    const is = moved ? "still dances everybody" : "is the coded figure";
    it(`${is}, ${from} — ${result.formation} ${JSON.stringify(result.params)}`, () => {
      expect(result.problems).toEqual([]);
      expect(result.samples).toBeGreaterThan(0);
      expect(result.holdPlace).toEqual([]);
    });
  }

  const claim = moved
    ? `has moved exactly this far from the coded figure — ${moved.why}`
    : "is the coded figure to the last pixel, wherever the dancers start";
  it(claim, () => {
    const worst = worstOf(all);
    expect(worst.samples).toBeGreaterThan(least);
    if (!moved) {
      expect(worst.position).toBe(0);
      expect(worst.facing).toBe(0);
      expect(worst.hand).toBe(0);
      return;
    }
    expect(worst.position).toBeCloseTo(moved.position, 2);
    expect(worst.facing).toBeCloseTo(moved.facing, 1);
    expect(worst.hand).toBeCloseTo(moved.hand, 2);
    expect(Math.max(...all.map((result) => result.endPx))).toBeCloseTo(moved.endPx, 2);
    expect(Math.max(...all.map((result) => result.endDeg))).toBeCloseTo(moved.endDeg, 1);
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
    {
      why: CRUISE_WHY,
      position: 3.0278,
      facing: 12.24,
      hand: 2.925,
      endPx: 0,
      endDeg: 0,
    },
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
    {
      why: CRUISE_WHY,
      position: 3.0278,
      facing: 12.24,
      hand: 0.8301,
      endPx: 0,
      endDeg: 0,
    },
  );
});

describe("long lines as data", () => {
  carrier(
    longLines,
    findDefinition("long-lines"),
    [{ params: {} }, { params: { forwardPx: 6 } }, { params: { holdDrop: 4, stackPx: 0 } }],
    3000,
    {
      why:
        CRUISE_WHY +
        ". Long lines is also the one figure whose out-and-back becomes **two " +
        "legs** rather than one curve: four beats down the hall and four back, " +
        "each with its own ramps, instead of a single cosine over the eight",
      position: 0.2501,
      facing: 0,
      hand: 0.2501,
      endPx: 0,
      endDeg: 0,
    },
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
    {
      why: CRUISE_WHY,
      position: 0.6804,
      facing: 0,
      hand: 0,
      endPx: 0,
      endDeg: 0,
    },
  );
});

describe("the petronella as data", () => {
  carrier(
    petronella,
    findDefinition("petronella"),
    [{ params: {} }, { params: { places: 2 } }, { params: { spins: 2 } }, { params: { bowPx: 0 } }],
    2000,
    {
      why:
        CRUISE_WHY +
        ". The petronella's spin rides the travel's own progress, so the body " +
        "turns with the chord it is walking (Q8)",
      position: 0.6845,
      facing: 12.6675,
      hand: 1.7012,
      endPx: 0,
      endDeg: 0,
    },
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
    {
      why:
        'the user: "people should always turn inward so they go nose to nose first". ' +
        "The roll is inward now, so a robin whose partner stands on her left — which " +
        "in a minor set is every one of them — turns the other way from the coded " +
        "figure's fixed `spins: 1`. Nobody's feet move: the paths and the ends are " +
        "identical to the last pixel, which is why `position` and both `end` numbers " +
        "are still zero. What differs is the body through the roll (up to a half turn " +
        "at the worst beat of the two-turn case) and the joined hand it carries with " +
        'it while it is still held. The `roller: "lark"` case differs by nothing at ' +
        "all, and that is the proof: the coded turn was already inward for a lark, " +
        "whose robin stands on his right, and outward for every robin. " +
        "M10 adds the cruise to the bowed walk (the spin keeps its own " +
        "smoothstep, per Q8), which is the 0.66 px the path has moved.",
      position: 0.6599,
      facing: 176.5723,
      hand: 11.3353,
      endPx: 0,
      endDeg: 0,
    },
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
    {
      why:
        'the user: "totally wrong… holding either left-in-right or right-in-left, ' +
        'lark raises the hand, robin walks under, their direction switches". The ' +
        "twirl closes up to turn instead of windmilling round the point between " +
        "two dancers a whole set's width apart — sixteen px of arm where the " +
        "rendering contract allows fifteen — and the robin ducks inside the turn " +
        "while the lark walks round the outside of her. Nothing about where it " +
        "*leaves* anybody has moved, which is why both `end` numbers are zero and " +
        "`facing` is too: the half turn about the pair's own centre still " +
        "exchanges their places and reverses both facings. What moved is the " +
        "middle of the path (12.46 px at the closest approach) and the hand it " +
        "carries (7.11 px), which is now over the head of the dancer under the " +
        "arch instead of half way between the two. M10 puts the arc on the " +
        "cruise, and the twirl's `withArc` facing rides it (Q8), which is the " +
        "3.31 degrees of facing and the last hundredth of the hand.",
      position: 12.4592,
      facing: 3.3142,
      hand: 7.11,
      endPx: 0,
      endDeg: 0,
    },
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
    {
      why: CRUISE_WHY + ". Both halves cruise: the pass over and the couple's rigid rotation",
      position: 0.6847,
      facing: 3.3333,
      hand: 0.6847,
      endPx: 0,
      endDeg: 0,
    },
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
    {
      why:
        CRUISE_WHY +
        ". The chain used to move furthest of the nine — 13.4947 px, because the " +
        "cruise carried the lark further round his orbit by the join than the " +
        "coded twin's smoothstep did. **M10c closes almost all of that gap** " +
        "(1.2260 px): the user's ruling of 2026-09-16 gives the pull by four " +
        "beats of eight and the couple's turn the other four, and the lark's " +
        "own turn now starts at the join in both figures, so there is no " +
        "quarter-orbit for the two profiles to disagree over. What is left is " +
        "the cruise against the smoothstep inside the turn itself",
      position: 1.226,
      facing: 12.24,
      hand: 1.254,
      endPx: 0,
      endDeg: 0,
    },
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
