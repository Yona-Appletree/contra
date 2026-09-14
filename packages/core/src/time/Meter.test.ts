import { describe, expect, it } from "vitest";
import { REEL, beatInPhrase, beatsPerPhrase, phraseOf } from "./Meter.js";

describe("Meter", () => {
  it("a reel is 4 beats per bar, 2 bars per phrase, 8-beat phrases", () => {
    expect(REEL).toEqual({ beatsPerBar: 4, barsPerPhrase: 2 });
    expect(beatsPerPhrase(REEL)).toBe(8);
  });

  it("locates a beat in its phrase", () => {
    expect(phraseOf(REEL, 0)).toBe(0);
    expect(phraseOf(REEL, 7.9)).toBe(0);
    expect(phraseOf(REEL, 8)).toBe(1);
    expect(phraseOf(REEL, 63)).toBe(7);
    expect(beatInPhrase(REEL, 0)).toBe(0);
    expect(beatInPhrase(REEL, 9.5)).toBe(1.5);
    expect(beatInPhrase(REEL, 64)).toBe(0);
  });

  it("handles negative beats without wrapping wrong", () => {
    expect(beatInPhrase(REEL, -1)).toBe(7);
    expect(phraseOf(REEL, -1)).toBe(-1);
  });

  it("works for a meter that is not a reel", () => {
    const jig = { beatsPerBar: 6, barsPerPhrase: 2 };
    expect(beatsPerPhrase(jig)).toBe(12);
    expect(beatInPhrase(jig, 13)).toBe(1);
  });
});
