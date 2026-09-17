import { danceBeats, dist, poseAt } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import type { DanceFile } from "../../dances/loadDances.js";
import { danceFromFile } from "../../dances/loadDances.js";
import { CLOSURE_PX, danceAlone, oraclesFor } from "../../dances/oracle.js";
import { contraCyclePlanner } from "../../set/planCycle.js";
import { resolveFigureForms, resolveFigureText } from "../../text/figureText.js";
import { contraDataFigures } from "./index.js";
import { customDefinition } from "./custom.js";

/**
 * **A dance whose every call is `custom`** — the shape every imported Caller's
 * Box record has before anybody encodes a figure of it.
 *
 * It is a real transcript (the Caller's Box's own Butter, 10320) written the
 * way `corpus/importCallersBox.ts` writes one, so the case this file checks is
 * the case the corpus suite runs 12,000 times: the record loads, it plans, the
 * phrase arithmetic holds, and nobody moves a pixel.
 */
const RUN = { cycle: contraCyclePlanner, figures: contraDataFigures() };

/** One `custom` call, as the importer writes it. */
const call = (beats: number, text: string) => ({
  figure: "custom",
  beats,
  params: { text },
});

const ALL_CUSTOM: DanceFile = {
  slug: "custom-only",
  title: "Butter",
  author: "Gene Hubert",
  formation: "becket",
  status: "lab",
  notes: "Every call is `custom`: imported from the Caller's Box, not encoded.",
  source: {
    callersBoxId: 10320,
    url: "https://www.ibiblio.org/contradance/thecallersbox/dance.php?id=10320",
    permission: "full",
    transcript:
      "A1  (2) Shift left  (6) Circle left 3/4  (8) Neighbor swing\n" +
      "A2  (8) In long lines, go forward and back  (8) Ladies chain to partner",
  },
  phrases: [
    {
      name: "A1",
      figures: [call(2, "Shift left"), call(6, "Circle left 3/4"), call(8, "Neighbor swing")],
    },
    {
      name: "A2",
      figures: [call(8, "In long lines, go forward and back"), call(8, "Ladies chain to partner")],
    },
    {
      name: "B1",
      figures: [call(8, "Ladies allemande right 1 & 1/2"), call(8, "Partner swing")],
    },
    {
      // A zero-beat line: an exit clause takes no music, and `custom` is a
      // waypoints figure, so its ends are structural and the count may be 0
      // (`docs/dance-record.md` §"Zero-beat calls").
      name: "B2",
      figures: [
        call(8, "Right and left through"),
        call(0, "Face your neighbor"),
        call(8, "Ladies chain"),
      ],
    },
  ],
};

describe("the custom figure", () => {
  it("is plain data, like every other definition", () => {
    expect(JSON.parse(JSON.stringify(customDefinition))).toEqual(customDefinition);
  });

  it("loads a record whose every call is custom", () => {
    const dance = danceFromFile(ALL_CUSTOM);
    expect(dance.phrases).toHaveLength(4);
    expect(danceBeats(dance)).toBe(64);
    for (const phrase of dance.phrases) {
      const beats = phrase.figures.reduce((sum, f) => sum + f.beats, 0);
      expect(beats, phrase.name).toBe(16);
      for (const figure of phrase.figures) expect(figure.figure).toBe("custom");
    }
  });

  it("leaves every dancer exactly where the call found them", () => {
    const dance = danceFromFile(ALL_CUSTOM);
    for (const couples of [4, 6, 8]) {
      const timeline = danceAlone(dance, couples, 64, {}, RUN).timeline();
      const events = timeline.figures().filter((e) => e.figure === "custom");
      // Every dancer of every set, for every call of the dance, minus the two
      // that are standing out at the ends of a becket line.
      expect(events.length, `${String(couples)} couples`).toBeGreaterThan(0);
      for (const event of events) {
        for (const dancer of Object.values(event.bindings)) {
          const before = poseAt(timeline, dancer, event.start);
          const after = poseAt(timeline, dancer, event.end);
          expect(dist(before.p, after.p), `${dancer} in ${event.group}`).toBeLessThan(1e-9);
          expect(Math.abs(after.facing - before.facing), dancer).toBeLessThan(1e-9);
        }
      }
    }
  });

  it("takes no hands: a custom call is danced with the arms down", () => {
    const dance = danceFromFile(ALL_CUSTOM);
    const timeline = danceAlone(dance, 6, 64, {}, RUN).timeline();
    for (const dancer of timeline.dancers()) {
      for (const t of [1, 5, 12, 20, 33, 47, 60]) {
        const pose = poseAt(timeline, dancer, t);
        expect(pose.hands.L, `${dancer} at ${String(t)}`).toBe("down");
        expect(pose.hands.R, `${dancer} at ${String(t)}`).toBe("down");
      }
    }
  });

  it("closes at zero, at every becket line length", () => {
    const dance = danceFromFile(ALL_CUSTOM);
    for (const couples of [4, 5, 6, 7, 8]) {
      const oracles = oraclesFor(dance, couples, 128, {}, RUN);
      expect(oracles.closurePx, `${String(couples)} couples`).toBeLessThan(CLOSURE_PX);
      expect(oracles.coverage, `${String(couples)} couples`).toEqual([]);
    }
  });

  it("says the transcript's own line, upper-cased, when the record writes no call", () => {
    const forms = resolveFigureForms("custom", { beats: 8, text: "Ladies chain to partner" })!;
    // Every form is the same line: the transcript has no shorter way to say it.
    expect(forms.map((form) => form.beats)).toEqual([4, 2, 1]);
    for (const form of forms) expect(form.text).toBe("LADIES CHAIN TO PARTNER");
  });

  it("teaches the transcript's own line in the walkthrough", () => {
    const texts = resolveFigureText("custom", { beats: 8, text: "shift left" } as never);
    // The walkthrough's own first letter is capitalised, because a slot's words
    // are written in the case they take mid-sentence and this one opens on one.
    expect(texts?.walkthrough.line.startsWith("Shift left")).toBe(true);
    expect(texts?.walkthrough.teach.startsWith("Shift left")).toBe(true);
  });
});
