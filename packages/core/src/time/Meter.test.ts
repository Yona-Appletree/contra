import { describe, expect, it } from "vitest";
import { JIG, REEL, beatInPhrase, beatsPerPhrase, phraseOf } from "./Meter.js";

describe("Meter", () => {
  it("a reel is 2 beats per bar, 8 bars per phrase, 16-beat phrases", () => {
    expect(REEL).toEqual({ beatsPerBar: 2, barsPerPhrase: 8 });
    expect(beatsPerPhrase(REEL)).toBe(16);
  });

  it("a jig bar is also 2 dance beats, same phrase length as a reel", () => {
    expect(JIG).toEqual({ beatsPerBar: 2, barsPerPhrase: 8 });
    expect(beatsPerPhrase(JIG)).toBe(16);
  });

  it("locates a beat in its phrase", () => {
    expect(phraseOf(REEL, 0)).toBe(0);
    expect(phraseOf(REEL, 15.9)).toBe(0);
    expect(phraseOf(REEL, 16)).toBe(1);
    expect(phraseOf(REEL, 127)).toBe(7);
    expect(beatInPhrase(REEL, 0)).toBe(0);
    expect(beatInPhrase(REEL, 17.5)).toBe(1.5);
    expect(beatInPhrase(REEL, 128)).toBe(0);
  });

  it("handles negative beats without wrapping wrong", () => {
    expect(beatInPhrase(REEL, -1)).toBe(15);
    expect(phraseOf(REEL, -1)).toBe(-1);
  });

  it("works for a meter that is not a reel or jig", () => {
    const waltz = { beatsPerBar: 3, barsPerPhrase: 4 };
    expect(beatsPerPhrase(waltz)).toBe(12);
    expect(beatInPhrase(waltz, 13)).toBe(1);
  });
});
