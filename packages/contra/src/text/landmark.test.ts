import { withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES } from "../dances/index.js";
import { formationFor } from "../dances/oracle.js";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { probeGroup } from "../figures/testing.js";
import { figureDefOf } from "./figureText.js";
import type { Place } from "./landmark.js";
import { facingClause, isHome, landmark, relationOf } from "./landmark.js";

/**
 * The landmark is the one sentence of a walkthrough nobody writes: where the
 * figure leaves you, read off the engine's own end places. These tests are
 * about whether it reads like a caller, because that is the only thing it is
 * for.
 */

const at = (across: number, along: number, facing = 90): Place => ({ across, along, facing });

describe("the vocabulary of relations", () => {
  it("calls the other line across the set", () => {
    expect(relationOf(at(16, -10), at(-16, -10))).toBe("across the set from");
  });

  it("calls your own line, one place along, next to", () => {
    expect(relationOf(at(16, -10), at(16, 10))).toBe("next to");
  });

  it("calls the far corner the diagonal", () => {
    expect(relationOf(at(16, -10), at(-16, 30))).toBe("on the diagonal from");
  });

  it("calls a dancer two couples down your own line along the line", () => {
    expect(relationOf(at(16, -10), at(16, 50))).toBe("along the line from");
  });

  it("is home on the place alone, never on the facing", () => {
    // A duple improper station faces down the hall on paper and every figure
    // leaves its dancers facing across the set, so a facing test would call
    // every opening long lines a journey.
    expect(isHome(at(16, -10, 90), at(16, -10, 180))).toBe(true);
    expect(isHome(at(16, -10), at(16, 10))).toBe(false);
  });

  it("says who you ended up looking at, and nothing when it is neither", () => {
    const me = at(16, -10, 180);
    const partner = at(-16, -10);
    const neighbor = at(16, 10);
    expect(facingClause(me, partner, neighbor)).toBe("facing your partner");
    expect(facingClause(at(16, -10, 90), partner, neighbor)).toBe("facing your neighbor");
    expect(facingClause(at(16, -10, 270), partner, neighbor)).toBeUndefined();
  });
});

describe("the landmark a figure ends on", () => {
  it("is the user's own sentence for a circle left three quarters in becket", () => {
    // The ruling, verbatim: "take hands in a ring. circle three places to your
    // left. you should be across the set from your partner, next to your
    // neighbor."
    const def = figureDefOf("circle")!;
    const group = probeGroup(BECKET, 4);
    expect(landmark(def, withDefaults(def, { direction: "left", places: 3 }, 8), group)).toBe(
      "You should be across the set from your partner, next to your neighbor.",
    );
  });

  it("sends you home from a figure that closes on itself", () => {
    const def = figureDefOf("long-lines")!;
    const group = probeGroup(DUPLE_IMPROPER, 4);
    expect(landmark(def, withDefaults(def, {}, 8), group)).toBe(
      "You are back where you started, facing your partner.",
    );
  });

  it("teaches the two roles apart when the figure leaves them apart", () => {
    const def = figureDefOf("allemande")!;
    const group = probeGroup(DUPLE_IMPROPER, 4);
    const said = landmark(def, withDefaults(def, { pairs: [["1R", "2R"]], amount: 1.5 }, 8), group);
    expect(said).toContain("Larks, you");
    expect(said).toContain("Robins, you");
  });

  it("says nothing at all for a couple waiting out at the end of the line", () => {
    const def = figureDefOf("wait-out")!;
    const group = probeGroup(DUPLE_IMPROPER, 2);
    expect(landmark(def, withDefaults(def, {}, 64), group)).toBeUndefined();
  });
});

/**
 * One case per figure, each on one dance: every figure the ten dances call,
 * read in the first dance that calls it. Enough to catch a figure whose end
 * places stop making a sentence; far short of every figure on every dance,
 * which would be ten times the work for the same answer.
 */
describe("every figure the demo dances call has a landmark", () => {
  const seen = new Map<string, { slug: string; call: { figure: string; beats: number } }>();
  for (const dance of DEMO_DANCES) {
    for (const phrase of dance.phrases) {
      for (const call of phrase.figures) {
        if (!seen.has(call.figure)) seen.set(call.figure, { slug: dance.slug, call });
      }
    }
  }

  it.each([...seen.keys()])("%s", (figure) => {
    const { slug, call } = seen.get(figure)!;
    const dance = DEMO_DANCES.find((d) => d.slug === slug)!;
    const def = figureDefOf(figure)!;
    const params = withDefaults(def, (call as { params?: object }).params, call.beats);
    const said = landmark(def, params, probeGroup(formationFor(dance), 4));
    expect(said, `${slug}: ${figure}`).toBeDefined();
    // A caller's sentence: it starts with a capital, it ends with a stop, and
    // it tells the dancer something about where they are standing.
    expect(said!, `${slug}: ${figure}`).toMatch(/^[A-Z].*\.$/);
    expect(said!, `${slug}: ${figure}`).toMatch(
      /back where you started|across the set|next to|on the diagonal|along the line/,
    );
  });
});
