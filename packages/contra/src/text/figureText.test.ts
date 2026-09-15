import { WALK_TO_STATION, withDefaults } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { DEMO_DANCES } from "../dances/index.js";
import { formationFor } from "../dances/oracle.js";
import { BECKET } from "../formation/becket.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { CONTRA_FIGURE_IDS } from "../figures/registry.js";
import { probeGroup } from "../figures/testing.js";
import { waitOut } from "../figures/wait-out.js";
import { dataOnlyFigureIds } from "../library/figures/index.js";
import {
  FIGURE_TEXTS,
  LONG_CALL_WORDS,
  LONG_WORDS,
  SHORT_CALL_WORDS,
  SHORT_WORDS,
  checkFigureTexts,
  figureDefOf,
  pairingName,
  renderSlot,
  resolveFigureText,
  slotsIn,
  textsOf,
  variantValue,
} from "./figureText.js";

/**
 * Every figure the library holds, which is what must have texts: the coded
 * ones, the ones that are **only** data (M6's `pull-by`), and the engine's two.
 */
const IDS = [...CONTRA_FIGURE_IDS, ...dataOnlyFigureIds(), waitOut.id, WALK_TO_STATION.id];

/** How many words a text is, with a `{slot}` counted as the one word it becomes. */
const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

describe("every move has its four texts", () => {
  it("loads with nothing to complain about", () => {
    expect(checkFigureTexts()).toEqual([]);
  });

  it.each(IDS)("%s has a file with all four", (id) => {
    const file = FIGURE_TEXTS[id];
    expect(file, `no data/figures/${id}.json`).toBeDefined();
    expect(file!.walkthrough.short.length).toBeGreaterThan(0);
    expect(file!.walkthrough.long.length).toBeGreaterThan(0);
    expect(file!.call.short.length).toBeGreaterThan(0);
    expect(file!.call.long.length).toBeGreaterThan(0);
  });

  it("has no text file for a figure the registry does not hold", () => {
    expect([...Object.keys(FIGURE_TEXTS)].sort()).toEqual([...IDS].sort());
  });

  it("ends every long walkthrough of a figure danced in a set of four on the landmark", () => {
    // The landmark asks a figure where it leaves the **four** dancers of a
    // hands-four group. Three figures cannot answer: the engine's two, which
    // nobody calls, and M6's travellers, which are figures of the whole line —
    // a pull-by is two dancers of a lane and a grand right and left is all of
    // them, so "you should be across the set from your partner" is not a
    // sentence either of them could finish. M7's shapes with named places are
    // what give a lane figure a landmark of its own.
    const outside = new Set<string>([waitOut.id, WALK_TO_STATION.id, ...dataOnlyFigureIds()]);
    for (const id of IDS) {
      if (outside.has(id)) continue;
      expect(FIGURE_TEXTS[id]!.walkthrough.long, id).toMatch(/\{where\}$/);
    }
  });
});

describe("the voice (docs/move-texts.md)", () => {
  // The user: "we really want them not to sound like ai slop." These are the
  // tells — a hedge, a parenthetical aside, an adjective about the figure, an
  // "(unsure: …)" left in by whoever wrote it — written down so they cannot
  // come back one text at a time.
  const BANNED = [
    "(",
    ")",
    "unsure",
    "usually",
    "typically",
    "graceful",
    "elegant",
    "flowing",
    "note that",
    "of course",
    "simply",
    "essentially",
  ];

  it.each(IDS)("%s says nothing an AI would say", (id) => {
    for (const [where, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      for (const [field, text] of Object.entries(texts)) {
        const lower = String(text).toLowerCase();
        for (const banned of BANNED) {
          expect(lower, `${id} ${where}.${field} contains "${banned}"`).not.toContain(banned);
        }
      }
    }
  });

  it.each(IDS)("%s keeps to its word budget", (id) => {
    for (const [where, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      const kind = where.endsWith("call") ? "call" : "walkthrough";
      for (const [field, text] of Object.entries(texts)) {
        const budget =
          kind === "call"
            ? field === "short"
              ? SHORT_CALL_WORDS
              : LONG_CALL_WORDS
            : field === "short"
              ? SHORT_WORDS
              : LONG_WORDS;
        expect(words(String(text)), `${id} ${where}.${field}`).toBeLessThanOrEqual(budget);
      }
    }
  });

  it.each(IDS)("%s writes its calls the way the bubble draws them", (id) => {
    for (const [where, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      if (!where.endsWith("call")) continue;
      for (const [field, text] of Object.entries(texts)) {
        // Capitals, digits, spaces and the hyphen of DO-SI-DO; a `{slot}` is
        // written in lowercase and shouted when it is filled in.
        expect(String(text), `${id} ${where}.${field}`).toMatch(/^[A-Z0-9 \-{}a-z]+$/);
        expect(String(text).replace(/\{[a-z]+\}/g, ""), `${id} ${where}.${field}`).not.toMatch(
          /[a-z]/,
        );
      }
    }
  });

  it.each(IDS)("%s writes whole sentences in its walkthroughs", (id) => {
    for (const [where, texts] of textsOf(FIGURE_TEXTS[id]!)) {
      if (where.endsWith("call")) continue;
      for (const [field, text] of Object.entries(texts)) {
        const written = String(text);
        expect(written, `${id} ${where}.${field}`).not.toContain("  ");
        expect(written.trim(), `${id} ${where}.${field}`).toBe(written);
        expect(written, `${id} ${where}.${field}`).toMatch(/(\.|\{where\})$/);
      }
    }
  });
});

describe("a call's own parameters fill every slot", () => {
  // One case per dance rather than per figure per dance: ten cases, each
  // resolving a whole time through, is the whole corpus at a few ms each.
  it.each(DEMO_DANCES.map((d) => d.slug))("%s leaves no slot unresolved", (slug) => {
    const dance = DEMO_DANCES.find((d) => d.slug === slug)!;
    const group = probeGroup(formationFor(dance), 4);
    for (const phrase of dance.phrases) {
      for (const call of phrase.figures) {
        const def = figureDefOf(call.figure)!;
        const params = withDefaults(def, call.params, call.beats);
        const texts = resolveFigureText(call.figure, params, group);
        expect(texts, `${slug}: ${call.figure}`).toBeDefined();
        for (const text of [
          texts!.walkthrough.short,
          texts!.walkthrough.long,
          texts!.call.short,
          texts!.call.long,
        ]) {
          expect(slotsIn(text), `${slug}: ${call.figure}: "${text}"`).toEqual([]);
          expect(text, `${slug}: ${call.figure}`).not.toContain("{");
          expect(text.length, `${slug}: ${call.figure}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("resolves a figure nobody calls from its own defaults", () => {
    const group = probeGroup(DUPLE_IMPROPER, 4);
    for (const id of ["california-twirl", "roll-away", "balance"]) {
      const def = figureDefOf(id)!;
      const texts = resolveFigureText(id, withDefaults(def, {}, def.beats), group);
      expect(slotsIn(texts!.walkthrough.long), id).toEqual([]);
    }
  });

  it("refuses a slot whose parameter the call does not carry", () => {
    const def = figureDefOf("circle")!;
    const params = { ...withDefaults(def, {}, def.beats) } as Record<string, unknown>;
    delete params["direction"];
    expect(() =>
      resolveFigureText("circle", params as never, probeGroup(DUPLE_IMPROPER, 4)),
    ).toThrow(/direction/);
  });

  it("refuses `{where}` without a group to work it out from", () => {
    const def = figureDefOf("circle")!;
    expect(() => resolveFigureText("circle", withDefaults(def, {}, def.beats))).toThrow(/where/);
  });

  it("refuses `{where}` outside a minor set of four, which is misuse", () => {
    const def = figureDefOf("swing")!;
    expect(() =>
      resolveFigureText("swing", withDefaults(def, {}, def.beats), probeGroup(BECKET, 2)),
    ).toThrow(/outside a minor set of four/);
  });

  it("says nothing, rather than refusing, when the ends are no sentence", () => {
    // A becket neighbour swing **from the stations**: the two of them start
    // across the set from each other, so they end 32 px apart on their own two
    // places. That is a true answer and not a sentence a caller says, so the
    // landmark stands down — `landmark` is written to — and the walkthrough is
    // the same walkthrough with its last sentence missing rather than a page
    // that refused to build. The Moves gallery really does run figures from the
    // stations whether or not a dance hands them over there.
    const def = figureDefOf("swing")!;
    const texts = resolveFigureText(
      "swing",
      withDefaults(def, { pairs: "neighbors" }, def.beats),
      probeGroup(BECKET, 4),
    );
    expect(texts).toBeDefined();
    expect(texts!.walkthrough.long).toContain("Open out side by side");
    expect(texts!.walkthrough.long).not.toContain("{");
    expect(texts!.walkthrough.long.trim()).toBe(texts!.walkthrough.long);
    // And a figure whose ends *are* a sentence still says one.
    const said = resolveFigureText(
      "swing",
      withDefaults(def, { pairs: "partners" }, def.beats),
      probeGroup(DUPLE_IMPROPER, 4),
    );
    expect(said!.walkthrough.long.length).toBeGreaterThan(texts!.walkthrough.long.length);
  });

  it("knows nothing about a figure with no file", () => {
    expect(resolveFigureText("moon-walk", { beats: 8 } as never)).toBeUndefined();
  });
});

describe("the slot vocabulary", () => {
  it("says a pairing two ways: a call shouts, a walkthrough teaches", () => {
    expect(renderSlot("pairs", "neighbors", "call")).toBe("neighbor");
    expect(renderSlot("pairs", "neighbors", "prose")).toBe("your neighbor");
    expect(renderSlot("pairs", "partners", "call")).toBe("partner");
    expect(renderSlot("pairs", [["1R", "2R"]], "prose")).toBe("the other robin");
  });

  it("names the two robins and the two larks from the stations written out", () => {
    expect(pairingName([["1R", "2R"]])).toBe("robins");
    expect(pairingName([["1L", "2L"]])).toBe("larks");
    expect(pairingName([["1L", "2R"]])).toBeUndefined();
    expect(variantValue("partners")).toBe("partners");
    expect(variantValue(1.5)).toBe("1.5");
  });

  it("says how far in words, not in numbers", () => {
    expect(renderSlot("amount", 1.5, "call")).toBe("one and a half");
    expect(renderSlot("amount", 1.5, "prose")).toBe("once and a half");
    expect(renderSlot("places", 3, "call")).toBe("three quarters");
    expect(renderSlot("places", 3, "prose")).toBe("three places");
    expect(renderSlot("places", 4, "call")).toBe("once");
  });

  it("has no words for a parameter measured in pixels", () => {
    expect(renderSlot("bowPx", 5, "prose")).toBeUndefined();
    expect(renderSlot("amount", 3.25, "prose")).toBeUndefined();
  });
});

describe("the variants", () => {
  it("gives the robins' allemande its own prose", () => {
    const def = figureDefOf("allemande")!;
    const group = probeGroup(DUPLE_IMPROPER, 4);
    const robins = resolveFigureText(
      "allemande",
      withDefaults(def, { pairs: [["1R", "2R"]], hand: "L", amount: 1.5 }, 8),
      group,
    );
    expect(robins!.walkthrough.short).toContain("Robins only");
    expect(robins!.call.long).toBe("ROBINS ALLEMANDE LEFT ONE AND A HALF");

    const both = resolveFigureText("allemande", withDefaults(def, { pairs: "partners" }, 8), group);
    expect(both!.walkthrough.short).not.toContain("Robins only");
  });

  it("gives half a hey its own length and its own call", () => {
    const def = figureDefOf("hey")!;
    const group = probeGroup(DUPLE_IMPROPER, 4);
    const half = resolveFigureText("hey", withDefaults(def, { amount: 0.5 }, 8), group);
    expect(half!.call.short).toBe("HALF A HEY");
    expect(half!.walkthrough.long).toContain("Eight beats");

    const full = resolveFigureText("hey", withDefaults(def, {}, 16), group);
    expect(full!.call.short).toBe("HEY");
    expect(full!.walkthrough.long).toContain("Sixteen beats");
  });

  it("mirrors the whole weave when the larks start", () => {
    const def = figureDefOf("hey")!;
    const group = probeGroup(DUPLE_IMPROPER, 4);
    const larks = resolveFigureText(
      "hey",
      withDefaults(def, { start: "lark", by: "left" }, 16),
      group,
    );
    expect(larks!.walkthrough.long).toContain("Larks start, passing left shoulders");
  });
});
