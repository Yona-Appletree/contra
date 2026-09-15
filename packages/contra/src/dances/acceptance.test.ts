import { createHall } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { createContraRegistry } from "../figures/registry.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { contraLibrary } from "../library/figures/index.js";
import { parseRelation, relate } from "../set/relations.js";
import { modelFromSet } from "../set/SetModel.js";
import { setRulesFor } from "../set/SetRules.js";
import { ACCEPTANCE_SET, UNSUPPORTED_FIGURES, UNSUPPORTED_RELATIONS } from "./acceptance.js";

/**
 * **The vocabulary test** (`plan.md` §"Validation strategy"): every figure name
 * and every relation word the twelve acceptance dances use either resolves
 * today, or is on an explicit list naming the milestone that owns it.
 *
 * So the list of what the rebuild still owes is a test rather than a memory,
 * and — the half that matters more — a figure or relation that becomes
 * supported and is still listed **fails**, which is what stops the list going
 * stale as M4, M5, M6, M7, M8 and M9 land.
 */

// The library the planner really resolves against: every coded figure
// bridged, with the definitions that have replaced their bridges — and M6's
// two, which have no coded twin at all.
const LIBRARY = contraLibrary(createContraRegistry());

const MODEL = modelFromSet(
  DUPLE_IMPROPER,
  createHall(DUPLE_IMPROPER, [{ id: "set0", couples: 6, centre: [0, 0], axis: 90 }]).sets[0]!,
  new Map(),
);
const TABLE = setRulesFor(DUPLE_IMPROPER).relations;
const ME = Object.keys(MODEL.dancers)[0]!;

/** Whether this relation word resolves today, rather than naming a later milestone. */
function relationResolves(word: string): boolean {
  try {
    relate(MODEL, TABLE, ME, parseRelation(word));
    return true;
  } catch {
    return false;
  }
}

describe("the twelve acceptance dances, as a vocabulary", () => {
  it("holds all twelve, each with a transcript and an id", () => {
    expect(ACCEPTANCE_SET).toHaveLength(12);
    expect(new Set(ACCEPTANCE_SET.map((d) => d.slug)).size).toBe(12);
    for (const dance of ACCEPTANCE_SET) {
      expect(dance.callersBoxId, dance.slug).toBeGreaterThan(0);
      expect(dance.transcript, dance.slug).toContain("A1");
      expect(dance.figures.length, dance.slug).toBeGreaterThan(0);
    }
  });

  for (const dance of ACCEPTANCE_SET) {
    it(`${dance.slug}: every figure it calls resolves, or names its milestone`, () => {
      for (const figure of dance.figures) {
        const owed = UNSUPPORTED_FIGURES[figure];
        expect(
          LIBRARY.has(figure) || owed !== undefined,
          `"${figure}" is neither in the library nor on the unsupported list`,
        ).toBe(true);
      }
    });

    it(`${dance.slug}: every relation word it names parses, and resolves or names its milestone`, () => {
      for (const word of dance.relations) {
        expect(() => parseRelation(word), word).not.toThrow();
        const owed = UNSUPPORTED_RELATIONS[word];
        expect(
          relationResolves(word) || owed !== undefined,
          `"${word}" neither resolves nor is on the unsupported list`,
        ).toBe(true);
      }
    });
  }
});

describe("what the rebuild still owes, as a list that cannot go stale", () => {
  it("lists no figure the library already has", () => {
    for (const [figure, milestone] of Object.entries(UNSUPPORTED_FIGURES)) {
      expect(
        LIBRARY.has(figure),
        `"${figure}" is in the library now: take it off the unsupported list (${milestone} is done for it)`,
      ).toBe(false);
    }
  });

  it("lists no relation the formation tables already answer", () => {
    for (const [word, milestone] of Object.entries(UNSUPPORTED_RELATIONS)) {
      expect(
        relationResolves(word),
        `"${word}" resolves now: take it off the unsupported list (${milestone} is done for it)`,
      ).toBe(false);
    }
  });

  it("lists nothing the twelve do not actually use", () => {
    const used = new Set(ACCEPTANCE_SET.flatMap((d) => d.figures));
    for (const figure of Object.keys(UNSUPPORTED_FIGURES)) {
      expect(used.has(figure), `"${figure}" is on the list but no acceptance dance calls it`).toBe(
        true,
      );
    }
    const words = new Set(ACCEPTANCE_SET.flatMap((d) => d.relations));
    for (const word of Object.keys(UNSUPPORTED_RELATIONS)) {
      expect(words.has(word), `"${word}" is on the list but no acceptance dance names it`).toBe(
        true,
      );
    }
  });

  it("names a milestone this plan actually has for everything it owes", () => {
    const milestones = new Set(["M2", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11"]);
    for (const [figure, milestone] of Object.entries(UNSUPPORTED_FIGURES)) {
      expect(milestones.has(milestone), `${figure}: "${milestone}"`).toBe(true);
    }
    for (const [word, milestone] of Object.entries(UNSUPPORTED_RELATIONS)) {
      expect(milestones.has(milestone), `${word}: "${milestone}"`).toBe(true);
    }
  });

  it("owes exactly this much, spelled out so the report can quote it", () => {
    // The whole point of the test: this list is the remaining work, by name.
    expect(
      Object.entries(UNSUPPORTED_FIGURES)
        .map(([k, v]) => `${k} (${v})`)
        .sort(),
      // **Empty since M9.** The four the Banner dances owed — `diamond`,
      // `square-through`, `interrupted-square-through` and `jersey-twirl` —
      // are definitions in `library/figures/` with their own texts.
    ).toEqual([]);
    // Empty since M6: every relation the twelve name resolves in both contra
    // formations' tables.
    expect(
      Object.entries(UNSUPPORTED_RELATIONS)
        .map(([k, v]) => `${k} (${v})`)
        .sort(),
    ).toEqual([]);
  });
});
