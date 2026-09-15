import { describe, expect, it } from "vitest";
import { ALL_DANCES, DEMO_DANCES } from "../dances/index.js";
import { BECKET } from "../formation/becket.js";
import { BECKET_RIGHT } from "../formation/becketRight.js";
import { DUPLE_IMPROPER } from "../formation/dupleImproper.js";
import { PROPER } from "../formation/proper.js";
import { danceWalkthrough } from "./walkthrough.js";

/**
 * A walkthrough is what a caller reads out before the music starts, so it is
 * tested the way one is read: does every dance have one, does it open and close
 * on a sentence, and does every entry name a figure and say something about it.
 */

describe("every programme dance has a walkthrough", () => {
  // One case per dance: each dances a whole time through on a probe line, which
  // is a few ms each and fifteen of them in one case would share one budget.
  it.each(DEMO_DANCES.map((d) => d.slug))("%s", (slug) => {
    const dance = DEMO_DANCES.find((d) => d.slug === slug)!;
    const card = danceWalkthrough(dance);

    // An entry per written call of the record, in order.
    const calls = dance.phrases.flatMap((phrase) => phrase.figures);
    expect(card.entries.map((entry) => entry.index)).toEqual(calls.map((_call, i) => i));
    expect(card.entries.map((entry) => entry.lines[0]!.figure)).toEqual(
      calls.map((call) => call.figure),
    );

    // Every entry reads as a caller's own line.
    for (const entry of card.entries) {
      expect(entry.heading, `${slug} ${entry.phrase}`).toMatch(/^[A-Z]/);
      expect(entry.heading, `${slug} ${entry.phrase}`).not.toContain("{");
      expect(["name", "line"]).toContain(entry.defaultLevel);
      for (const line of entry.lines) {
        expect(line.line, `${slug} ${line.figure}`).not.toContain("{");
        expect(line.teach, `${slug} ${line.figure}`).not.toContain("{");
      }
    }

    expect(card.opening.line, slug).toMatch(/^Take hands four from the top[.,]/);
    expect(card.wrap.text, slug).toMatch(/\.$/);
    // Every dance in the programme progresses; a dance that says it did not is
    // a dance whose record is wrong, which is what `progressed` is for.
    expect(card.wrap.progressed, slug).toBe(true);
  });
});

describe("the wrap", () => {
  it("sends a becket dance to its own diagonal", () => {
    const card = danceWalkthrough(DEMO_DANCES.find((d) => d.slug === "butter")!);
    expect(card.wrap.text).toBe(
      "That's once through. Your new neighbors are on your left diagonal. " +
        "Next time starts with the slide left to them.",
    );
  });

  it("names both roles' shifts where they differ", () => {
    const dance = ALL_DANCES.find((d) => d.slug === "contrablend")!;
    expect(danceWalkthrough(dance).wrap.text).toContain("larks one place, robins three places");
  });

  it("names the new neighbours only where the next time through starts with them", () => {
    // Airpants opens on a neighbour balance and swing; The Carousel opens on
    // long lines, which is with nobody in particular.
    expect(danceWalkthrough(DEMO_DANCES.find((d) => d.slug === "airpants")!).wrap.text).toContain(
      "Your new neighbors are along your line",
    );
    expect(
      danceWalkthrough(DEMO_DANCES.find((d) => d.slug === "the-carousel")!).wrap.text,
    ).not.toContain("Your new neighbors");
  });

  it("says which pass has ended in a record that has two", () => {
    const dance = ALL_DANCES.find((d) => d.slug === "annas-reel")!;
    const breaks = danceWalkthrough(dance).entries.filter((e) => e.passBreak !== undefined);
    expect(breaks.map((e) => e.passBreak)).toEqual(["That's the first pass."]);
  });
});

describe("the openings a formation supplies", () => {
  it("opens a duple improper dance in the user's own words", () => {
    expect(DUPLE_IMPROPER.walkthroughOpening?.(null)).toEqual({
      line:
        "Take hands four from the top. Larks on the left, robins on the right, " +
        "facing up and down the set.",
      hint: "Your partner is across from you. You are facing your direction of progression.",
    });
  });

  it("opens a becket dance on the circle, and says which way it goes", () => {
    expect(BECKET.walkthroughOpening?.("left").line).toBe(
      "Take hands four from the top, then circle one place to the left. " +
        "This is a becket dance, your partner is beside you. You will progress to the left.",
    );
    expect(BECKET_RIGHT.walkthroughOpening?.("right").line).toContain("to the right");
  });

  it("opens a proper dance on keeping your own side", () => {
    const opening = PROPER.walkthroughOpening?.(null);
    expect(opening?.line).toContain("Larks in one line, robins in the other");
    expect(opening?.hint).toBe("Your partner is across from you. Your neighbor is beside you.");
  });

  it("warns a swap-sides record that it swaps", () => {
    const dance = ALL_DANCES.find((d) => d.slug === "annas-reel")!;
    expect(danceWalkthrough(dance).opening.hint).toContain(
      "Every time through you swap sides with your partner.",
    );
  });
});

describe("a concurrent call is one entry", () => {
  it("reads its branches as one heading joined by while", () => {
    const dance = ALL_DANCES.find((d) => d.slug === "fatal-attraction")!;
    const card = danceWalkthrough(dance);
    const branched = card.entries.find((entry) => entry.lines.length > 1)!;
    expect(branched.lines.map((one) => one.branch)).toEqual([0, 1]);
    expect(branched.heading).toContain(" while ");
    expect(branched.lines[1]!.who).toBe("the other lark");
  });
});
