import type { Dance, Program } from "@caller/choreo";
import {
  SCRIPT_DECIDER_DEFAULTS,
  betweenDancesBeats,
  closureReport,
  createHall,
  createLibrary,
  createScriptDecider,
  danceBeats,
  nextDanceCall,
  validateDance,
} from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { BECKET } from "../formation/becket.js";
import { BECKET_RIGHT } from "../formation/becketRight.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { PROPER } from "../formation/proper.js";
import { createContraRegistry } from "../figures/registry.js";
import { DEMO_DANCES, DEMO_DANCE_SLUGS, danceBySlug } from "./index.js";
import { LAB_RUN } from "./danceLab.js";
import { CLOSURE_PX, COLLISION_PX, linesFor, oraclesFor } from "./oracle.js";

/**
 * The registry oracle: every encoded dance, at every line length the plan
 * asks for, against AC1, AC5 and AC6.
 *
 * A dance that fails any of these is not shipped — it is skipped and its
 * numbers go in the milestone report — so this test is what decides whether a
 * dance is in `DEMO_DANCES` at all.
 *
 * **It runs on the engine the Stage runs on.** M5 moved it there for On the
 * Prowl and M7 has two more of the same kind: a dance calling a figure that has
 * only ever been data cannot be danced by a registry of coded figures at all,
 * and since M3 what ships is `contraDataEngine()`.
 *
 */

describe("the demo dance registry", () => {
  it("holds at least the eight dances AC8 asks for", () => {
    expect(DEMO_DANCES.length).toBeGreaterThanOrEqual(8);
  });

  it("has no duplicate slugs", () => {
    expect(new Set(DEMO_DANCE_SLUGS).size).toBe(DEMO_DANCES.length);
  });

  it("finds every dance by its slug, and nothing else", () => {
    for (const dance of DEMO_DANCES) expect(danceBySlug(dance.slug)).toBe(dance);
    expect(danceBySlug("not-a-dance")).toBeUndefined();
  });

  for (const dance of DEMO_DANCES) {
    it(`${dance.slug}: four sixteen-beat phrases, an author, and a known formation`, () => {
      expect(danceBeats(dance)).toBe(64);
      expect(dance.phrases.map((p) => p.name)).toEqual(["A1", "A2", "B1", "B2"]);
      for (const phrase of dance.phrases) {
        expect(
          phrase.figures.reduce((n, f) => n + f.beats, 0),
          `${dance.slug} ${phrase.name}`,
        ).toBe(16);
      }
      expect(dance.author.length).toBeGreaterThan(0);
      expect([DUPLE_IMPROPER.id, BECKET.id, BECKET_RIGHT.id, PROPER.id]).toContain(dance.formation);
      expect(() => validateDance(dance)).not.toThrow();
    });

    it(`${dance.slug}: every figure has call text the caller can say`, () => {
      for (const phrase of dance.phrases) {
        for (const figure of phrase.figures) {
          expect(figure.call, `${dance.slug} ${phrase.name} ${figure.figure}`).toBeTruthy();
          expect(figure.call).toBe(figure.call?.toUpperCase());
        }
      }
    });

    it(`${dance.slug}: is only data, so it survives a round trip through JSON`, () => {
      expect(JSON.parse(JSON.stringify(dance)) as Dance).toEqual(dance);
    });
  }
});

describe("AC1, AC5 and AC6 over every encoded dance", () => {
  for (const dance of DEMO_DANCES) {
    for (const couples of linesFor(dance)) {
      it(`${dance.slug} with ${couples} couples`, () => {
        const o = oraclesFor(dance, couples, 128, {}, LAB_RUN);
        const where = JSON.stringify(o.worst);
        // AC5: closure, at every figure seam of eight times through.
        expect(o.seams).toBeGreaterThan(0);
        expect(o.closurePx, `closure: ${where}`).toBeLessThan(CLOSURE_PX);
        // AC1: every hand the figures place is one a 15 px arm reaches.
        expect(o.hands).toBeGreaterThan(0);
        expect(o.maxShort, `reach: ${where}`).toBe(0);
        // AC6: no two torso centres within 8 px, with no pair exempt.
        expect(o.pairs).toBeGreaterThan(0);
        expect(o.minDistancePx, `collision: ${where}`).toBeGreaterThan(COLLISION_PX);
        // And the timeline covers every dancer with no gap and no overlap.
        expect(o.coverage).toEqual([]);
      });
    }
  }
});

describe("a programme of every dance, danced end to end", () => {
  /** Every dance, twice through, which is what the demo page plays. */
  const program: Program = {
    slug: "demo",
    items: DEMO_DANCES.map((d) => ({ dance: d.slug, medley: "reel-set", timesThrough: 2 })),
  };

  /** Two times through of 64 beats, plus the whole between-dances interval. */
  const ITEM_BEATS = 2 * 64 + betweenDancesBeats(SCRIPT_DECIDER_DEFAULTS);

  it("switches from each dance to the next without anybody jumping", () => {
    const formations = [DUPLE_IMPROPER, BECKET, BECKET_RIGHT, PROPER];
    const registry = createContraRegistry(LAB_RUN.figures);
    const hall = createHall(DUPLE_IMPROPER, [{ id: "set0", couples: 5, centre: [0, 0], axis: 90 }]);
    const decider = createScriptDecider(
      program,
      registry,
      hall,
      createLibrary([...DEMO_DANCES], formations),
      { cycle: LAB_RUN.cycle },
    );
    // Two times through each, plus the between-dances interval after each.
    decider.advance(DEMO_DANCES.length * ITEM_BEATS + 64);
    const report = closureReport(decider.timeline());
    expect(report.seams).toBeGreaterThan(0);
    expect(report.maxPositionError, JSON.stringify(report.worst)).toBeLessThan(CLOSURE_PX);
  });

  it("announces each next dance by name once per time round the programme", () => {
    const registry = createContraRegistry(LAB_RUN.figures);
    const hall = createHall(DUPLE_IMPROPER, [{ id: "set0", couples: 5, centre: [0, 0], axis: 90 }]);
    const decider = createScriptDecider(
      program,
      registry,
      hall,
      createLibrary([...DEMO_DANCES], [DUPLE_IMPROPER, BECKET, BECKET_RIGHT, PROPER]),
      { cycle: LAB_RUN.cycle },
    );
    decider.advance(DEMO_DANCES.length * ITEM_BEATS);
    const announced = decider
      .timeline()
      .utterances()
      .filter((u) => u.text.startsWith("NEXT:"))
      .map((u) => u.text);
    expect(announced.length).toBeGreaterThanOrEqual(DEMO_DANCES.length - 1);
    expect(announced[0]).toBe(nextDanceCall(DEMO_DANCES[1]!));
  });
});
