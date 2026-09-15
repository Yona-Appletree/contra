import { parseOnly, type TuneObject } from "abcjs";
import { describe, expect, it } from "vitest";
import { tunes } from "./index.js";
import { BAND, barsOf, chordPair, halvesOf, writeAbc } from "./Tune.js";
import { inKey, tokensOf } from "../chords/harmonise.js";

const EXPECTED_FRACTION: Record<"reel" | "jig", { num: string; den: string }> = {
  reel: { num: "2", den: "2" },
  jig: { num: "6", den: "8" },
};

/** Eighths in a half-bar: four for a 2/2 reel, three for a 6/8 jig. */
const HALF_BAR: Record<"reel" | "jig", number> = { reel: 4, jig: 3 };

/** Count abcjs 'bar' elements across every line/staff/voice of a parsed tune. */
function countBars(visualObj: TuneObject): number {
  let bars = 0;
  for (const line of visualObj.lines) {
    if (!line.staff) continue;
    for (const staff of line.staff) {
      for (const voice of staff.voices ?? []) {
        bars += voice.filter((el) => el.el_type === "bar").length;
      }
    }
  }
  return bars;
}

describe("bundled tunes", () => {
  it.each(tunes)(
    "$title ($type) parses with abcjs and has 32 bars of the expected meter",
    (tune) => {
      const [visualObj] = parseOnly(tune.abc);
      expect(visualObj, `"${tune.title}" failed to parse`).toBeDefined();
      if (!visualObj) return;

      expect(countBars(visualObj)).toBe(32);

      const meter = visualObj.getMeter();
      expect(meter.type).toBe("specified");
      const [fraction] = meter.value ?? [];
      expect(fraction).toEqual(EXPECTED_FRACTION[tune.type]);
    },
  );

  it("has at least three tunes: two reels and one jig", () => {
    expect(tunes.length).toBeGreaterThanOrEqual(3);
    expect(tunes.filter((t) => t.type === "reel").length).toBeGreaterThanOrEqual(2);
    expect(tunes.filter((t) => t.type === "jig").length).toBeGreaterThanOrEqual(1);
  });

  it("every tune is marked as traditional, transcribed by hand", () => {
    for (const tune of tunes) {
      expect(tune.source).toBe("traditional, transcribed by hand");
    }
  });

  it("every tune declares a 64-beat cycle matching its meter (2 beats/bar x 8 bars/phrase x 4 phrases)", () => {
    for (const tune of tunes) {
      expect(tune.beatsPerCycle).toBe(64);
      expect(tune.meter.beatsPerBar * tune.meter.barsPerPhrase * 4).toBe(64);
    }
  });

  it("has at least ten tunes beyond the original three, at least three of them jigs", () => {
    expect(tunes.length).toBeGreaterThanOrEqual(13);
    expect(tunes.filter((t) => t.type === "jig").length).toBeGreaterThanOrEqual(4);
  });

  /**
   * Every tune's ABC body is four source lines of eight bars each — one
   * line per 16-beat phrase (A1/A2/B1/B2) — which is what lets `Notation`
   * map a beat to `.abcjs-l{0-3}.abcjs-m{0-7}` with plain arithmetic
   * instead of guessing line-wrap points. A bar is counted the same way
   * abcjs bars a line: by its "|" delimiters. Chord symbols sit inside the
   * bars they belong to and change nothing about this count.
   */
  it.each(tunes)("$title has exactly eight bars on each of its four source lines", (tune) => {
    const bodyLines = tune.abc
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^[A-Za-z]:/.test(line) && !line.startsWith("%%"));
    expect(bodyLines, `"${tune.title}" should have four melody lines`).toHaveLength(4);
    for (const [i, line] of bodyLines.entries()) {
      const bars = line.split("|").filter((bar) => bar.trim().length > 0);
      expect(bars, `"${tune.title}" line ${String(i + 1)}: "${line}"`).toHaveLength(8);
    }
  });
});

describe("the band: every tune is arranged, charted and in key", () => {
  it.each(tunes)("$title's ABC carries the arrangement's programs and volumes", (tune) => {
    const band = tune.arrangement;
    expect(band).toEqual(BAND);
    expect(tune.abc).toContain(`%%MIDI program ${String(band.melody.program)}\n`);
    expect(tune.abc).toContain(`%%MIDI chordprog ${String(band.chords.program)}\n`);
    expect(tune.abc).toContain(`%%MIDI bassprog ${String(band.bass.program)}\n`);
    expect(tune.abc).toContain(`%%MIDI chordvol ${String(band.chords.volume)}\n`);
    expect(tune.abc).toContain(`%%MIDI bassvol ${String(band.bass.volume)}\n`);
    expect(tune.abc).toContain(`K:${tune.key}\n`);
    // abcjs reads the same directives back.
    const [visualObj] = parseOnly(tune.abc);
    expect(visualObj?.formatting.midi).toMatchObject({
      program: [band.melody.program],
      chordprog: [band.chords.program],
      bassprog: [band.bass.program],
    });
  });

  it.each(tunes)("$title has a chord on every bar, in its own key", (tune) => {
    expect(tune.chords).toHaveLength(4);
    for (const [li, line] of tune.lines.entries()) {
      const bars = barsOf(line);
      expect(bars, `${tune.slug} line ${String(li)}`).toHaveLength(8);
      const chart = tune.chords[li];
      expect(chart, `${tune.slug} line ${String(li)}`).toHaveLength(8);
      for (const [bi, bar] of (chart ?? []).entries()) {
        for (const chord of chordPair(bar)) {
          expect(chord.length, `${tune.slug} line ${String(li)} bar ${String(bi)}`).toBeGreaterThan(
            0,
          );
          expect(
            inKey(chord, tune.key),
            `${tune.slug} line ${String(li)} bar ${String(bi)}: ${chord}`,
          ).toBe(true);
        }
      }
    }
  });

  it.each(tunes)("$title's every bar is two halves of the right length", (tune) => {
    for (const [li, line] of tune.lines.entries()) {
      for (const [bi, bar] of barsOf(line).entries()) {
        const halves = halvesOf(bar);
        for (const half of halves) {
          const eighths = tokensOf(half).reduce((sum, t) => sum + t.duration, 0);
          expect(eighths, `${tune.slug} line ${String(li)} bar ${String(bi)}: "${half}"`).toBe(
            HALF_BAR[tune.type],
          );
        }
      }
    }
  });

  it.each(tunes)("$title's chord symbols are written where abcjs plays them", (tune) => {
    const [visualObj] = parseOnly(tune.abc);
    const voice = visualObj?.lines[0]?.staff?.[0]?.voices?.[0] ?? [];
    // abcjs' `VoiceItem` union does not type `chord` on a note; it is there.
    const symbols = voice.flatMap(
      (el) => (el as { chord?: { name: string }[] }).chord?.map((c) => c.name) ?? [],
    );
    // Line 1's first bar starts with its first chord; a pair writes both.
    const [c1, c2] = chordPair(tune.chords[0]?.[0] ?? "");
    expect(symbols[0]).toBe(c1);
    if (c1 !== c2) expect(symbols[1]).toBe(c2);
  });

  it("writes a pair once when both halves carry the same chord, and a differing pair twice", () => {
    const abc = writeAbc({
      title: "t",
      type: "reel",
      key: "D",
      lines: ["d2dc d2fa|d2fa d2fa|", "", "", ""],
      chords: [
        [
          ["D", "D"],
          ["D", "A7"],
        ],
      ],
      arrangement: BAND,
    });
    expect(abc).toContain('"D"d2dc d2fa|"D"d2fa "A7"d2fa|');
  });
});
