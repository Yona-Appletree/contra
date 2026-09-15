import { withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES } from "../dances/index.js";
import { formationFor } from "../dances/oracle.js";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { probeGroup } from "../figures/testing.js";
import { dataOnlyDefinitions } from "../library/figures/index.js";
import { figureDefOf } from "./figureText.js";
import { isHome, landmark } from "./landmark.js";
import type { Place } from "./seam.js";
import { relationTo, sayWhoIsWhere } from "./seam.js";

/**
 * The landmark is the one sentence of a walkthrough nobody writes: where the
 * figure leaves you, read off the engine's own end places. These tests are
 * about whether it reads like a caller, because that is the only thing it is
 * for.
 */

const at = (across: number, along: number, facing = 90): Place => ({ across, along, facing });

describe("the vocabulary of relations", () => {
  const who = (me: Place, them: Place): string =>
    sayWhoIsWhere(relationTo(me, them), "your partner");

  it("calls the other line across the set", () => {
    expect(who(at(16, -10), at(-16, -10))).toBe("Your partner is across from you.");
  });

  it("calls your own line, one place along, beside you", () => {
    expect(who(at(16, -10), at(16, 10))).toBe("Your partner is beside you.");
  });

  it("calls the far corner a diagonal, and says which one", () => {
    expect(who(at(16, -10), at(-16, 30))).toBe("Your partner is on your right diagonal.");
    expect(who(at(-16, -10), at(16, 30))).toBe("Your partner is on your left diagonal.");
  });

  it("calls a dancer two couples down your own line along the line", () => {
    expect(who(at(16, -10), at(16, 50))).toBe("Your partner is along your line.");
  });

  it("calls somebody on your own line the other way behind you", () => {
    expect(who(at(16, 50, 90), at(16, -10))).toBe("Your partner is behind you.");
  });

  it("says a held hand whatever the geometry says", () => {
    expect(sayWhoIsWhere(relationTo(at(16, -10), at(-16, -10), "R"), "your partner")).toBe(
      "Your partner is in your right hand.",
    );
  });

  it("is home on the place alone, never on the facing", () => {
    // A duple improper station faces down the hall on paper and every figure
    // leaves its dancers facing across the set, so a facing test would call
    // every opening long lines a journey.
    expect(isHome(at(16, -10, 90), at(16, -10, 180))).toBe(true);
    expect(isHome(at(16, -10), at(16, 10))).toBe(false);
  });
});

describe("the landmark a figure ends on", () => {
  it("is the seam's own two sentences for a circle left three places in becket", () => {
    // The user's own ruling for this figure — "take hands in a ring. circle
    // three places to your left. you should be across the set from your
    // partner, next to your neighbor" — said in the vocabulary the seam hints
    // use, which is now the only vocabulary there is (A3).
    const def = figureDefOf("circle")!;
    const group = probeGroup(BECKET, 4);
    expect(landmark(def, withDefaults(def, { direction: "left", places: 3 }, 8), group)).toBe(
      "Your partner is across from you. Your neighbor is beside you.",
    );
  });

  it("says where both people are for a figure that closes on itself", () => {
    const def = figureDefOf("long-lines")!;
    const group = probeGroup(DUPLE_IMPROPER, 4);
    expect(landmark(def, withDefaults(def, {}, 8), group)).toBe(
      "Your partner is across from you. Your neighbor is beside you.",
    );
  });

  it("says one sentence for the whole four where the four agree", () => {
    // **The by-role branch is unreachable at figure level**, and that is a fact
    // about the question rather than about this code: `landmark` reads a
    // figure's ends by **station**, and a minor set of four is symmetric, so the
    // picture from each of the four stations is the same picture. The split
    // still happens at a **seam**, where the question is about *dancers* and the
    // next call may name one role's dancer and not the other's — which is
    // `seam.ts`'s, and `seam.test.ts`'s.
    const def = figureDefOf("allemande")!;
    const group = probeGroup(DUPLE_IMPROPER, 4);
    const said = landmark(def, withDefaults(def, { pairs: [["1R", "2R"]], amount: 1.5 }, 8), group);
    expect(said).toBe("Your partner is beside you. Your neighbor is across from you.");
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

  /**
   * The figures a landmark can be asked of at all.
   *
   * `landmark` plans a figure over the **four** dancers of a hands-four group
   * and reads its ends, which is a question only a figure resolution hands the
   * whole four can answer. A figure minted **per pair** (`anchor: "meet"`, a
   * cast off's named pivot) or **per dancer** (`actors: "each"`) refuses four
   * roles by name. Every such figure had a coded twin to answer for it — and
   * the coded figure is what `figureDefOf` hands back — until M5, whose
   * shoulder round is a figure for two with only a definition; M7 adds seven
   * more, and M7b's two dances add four (a pull-by and a grand right and left
   * are M6's own travellers, and a long wave and a circulate are danced by a
   * whole **line**, which is further from a hands-four still). None of them uses
   * `{where}` in its texts, so nothing asks for a landmark it cannot give, and
   * each ends its walkthrough on a sentence of its own.
   */
  const asked = [...seen.keys()].filter((id) => {
    const def = dataOnlyDefinitions().find((each) => each.id === id);
    if (def === undefined) return true;
    // **A figure that declares its own cast** cannot answer either (FR-B1):
    // turn contra corners is danced by six and a hands-four has four.
    if (def.cast !== undefined) return false;
    return def.actors === "all" || def.actors === "ring";
  });

  it("asks every figure the demo calls but the ones minted per pair, per dancer or per line", () => {
    expect([...seen.keys()].filter((id) => !asked.includes(id)).sort()).toEqual([
      "balance-wave",
      "cast-off",
      "circulate",
      "go-down-outside",
      "go-up-outside",
      "grand-right-and-left",
      "lead-down",
      "lead-up",
      "pull-by",
      "shoulder-round",
      "turn-alone",
      "turn-as-couples",
      // Six dancers, not four: the corners are in the couples above and below
      // (FR-B1, DD45), so a hands-four group cannot plan it and the figure's own
      // texts end on a sentence of their own.
      "turn-contra-corners",
    ]);
  });

  it.each(asked)("%s", (figure) => {
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
      /is (across from you|beside you|on your (left|right) diagonal|along your line|behind you|in your (left|right) hand)\./,
    );
  });
});
