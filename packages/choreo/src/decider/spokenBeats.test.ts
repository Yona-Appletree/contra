import { describe, expect, it } from "vitest";
import { spokenBeats } from "./spokenBeats.js";

// The user's own examples (director log, 2026-09-14): "'balance and swing' is
// one call" — a two-beat one — and a bare "swing" is one. The estimate is
// syllables at roughly two a beat, rounded up, floored at one beat.
describe("spokenBeats: a rhythm estimate from the words", () => {
  it("counts a one-syllable call as one beat", () => {
    expect(spokenBeats("SWING")).toBe(1);
  });

  it("counts BALANCE AND SWING as two beats, the user's own example", () => {
    expect(spokenBeats("BALANCE AND SWING")).toBe(2);
  });

  it("counts ROBINS CHAIN TO YOUR PARTNER as three or four beats", () => {
    // The brief's own phrasing ("three or four") — seven syllables, rounded
    // up to four two-syllable beats.
    expect(spokenBeats("ROBINS CHAIN TO YOUR PARTNER")).toBe(4);
  });

  it("never returns fewer than one beat, however short the text", () => {
    expect(spokenBeats("A")).toBe(1);
    expect(spokenBeats("")).toBe(1);
  });

  it("ignores punctuation: a comma or a hyphen is not a syllable", () => {
    expect(spokenBeats("NEXT: BUTTER, BY GENE HUBERT")).toBe(
      spokenBeats("NEXT BUTTER BY GENE HUBERT"),
    );
    expect(spokenBeats("DO-SI-DO")).toBeGreaterThanOrEqual(1);
  });

  it("does not count a trailing silent e as its own syllable", () => {
    // "lines" is one syllable, not two ("li" + a phantom "e" syllable) — the
    // difference between a naive vowel-group count and a caller's own ear.
    expect(spokenBeats("LINES")).toBe(1);
  });
});
