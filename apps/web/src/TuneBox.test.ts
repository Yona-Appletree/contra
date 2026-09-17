import { REEL } from "@caller/core";
import { ALL_DANCES, DEMO_DANCES } from "@caller/contra";
import type { Dance } from "@caller/choreo";
import { describe, expect, it } from "vitest";
import { captionsFor } from "./TuneBox.js";
import { danceMoves } from "./danceMoves.js";

const danceBySlug = (slug: string): Dance => {
  const dance = [...DEMO_DANCES, ...ALL_DANCES].find((d) => d.slug === slug);
  if (dance === undefined) throw new Error(`no dance ${slug}`);
  return dance;
};

/**
 * P5, AC8: the calls written under the bars they take.
 *
 * A stave is a phrase (16 beats, 8 bars of 2), so a caption's place is pure
 * arithmetic over the moves table — which is what makes it testable without a
 * browser, and what keeps `@caller/music` form-neutral: every word here comes
 * from the app.
 */
describe("captionsFor", () => {
  const airpants = danceMoves(danceBySlug("airpants"));

  it("writes one caption per move — six for Airpants — in call order", () => {
    const captions = captionsFor(airpants.phrases, REEL, null);
    expect(captions).toHaveLength(6);
    expect(captions.map((c) => c.text)).toEqual([
      "NEIGHBOR BALANCE AND SWING",
      "LONG LINES FORWARD AND BACK",
      "ROBINS ALLEMANDE RIGHT ONE AND A HALF",
      "PARTNER BALANCE AND SWING",
      "CIRCLE LEFT THREE QUARTERS",
      "NEIGHBOR DO-SI-DO ONE AND A HALF",
    ]);
  });

  it("places a whole-phrase move across the whole stave, and two half-phrase ones beside each other", () => {
    const captions = captionsFor(airpants.phrases, REEL, null);
    // A1: one sixteen-beat balance and swing, all eight bars of stave 0.
    expect(captions[0]).toMatchObject({ line: 0, fromBar: 0, bars: 8 });
    // A2: eight beats each, so four bars each, the second starting at bar 4.
    expect(captions[1]).toMatchObject({ line: 1, fromBar: 0, bars: 4 });
    expect(captions[2]).toMatchObject({ line: 1, fromBar: 4, bars: 4 });
  });

  it("gives B2's six-beat circle three bars and the ten-beat do-si-do five, from bar 3", () => {
    const captions = captionsFor(airpants.phrases, REEL, null);
    expect(captions[4]).toMatchObject({ line: 3, fromBar: 0, bars: 3 });
    expect(captions[5]).toMatchObject({ line: 3, fromBar: 3, bars: 5 });
  });

  it("marks exactly the current move, by its index across the whole dance", () => {
    const captions = captionsFor(airpants.phrases, REEL, 5);
    expect(captions.filter((c) => c.current === true).map((c) => c.text)).toEqual([
      "NEIGHBOR DO-SI-DO ONE AND A HALF",
    ]);
    expect(captionsFor(airpants.phrases, REEL, null).filter((c) => c.current === true)).toEqual([]);
  });

  it("gives Fatal Attraction's two-beat cast back a single bar", () => {
    const captions = captionsFor(danceMoves(danceBySlug("fatal-attraction")).phrases, REEL, null);
    const cast = captions.find((c) => c.text.startsWith("ROBINS CAST BACK"));
    expect(cast).toMatchObject({ line: 1, fromBar: 0, bars: 1 });
    // The six-beat right-shoulder round after it picks up where it left off.
    expect(captions.find((c) => c.text.startsWith("RIGHT SHOULDER"))).toMatchObject({
      line: 1,
      fromBar: 1,
      bars: 3,
    });
  });

  it("drops a phrase the tune has no stave for, rather than drawing it off the paper", () => {
    const eight = [...airpants.phrases, ...airpants.phrases];
    const captions = captionsFor(eight, REEL, null);
    expect(captions).toHaveLength(6);
    expect(Math.max(...captions.map((c) => c.line))).toBe(3);
  });
});
