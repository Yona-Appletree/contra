import { parseOnly, type TuneObject } from "abcjs";
import { describe, expect, it } from "vitest";
import { tunes } from "./index.js";

const EXPECTED_FRACTION: Record<"reel" | "jig", { num: string; den: string }> = {
  reel: { num: "2", den: "2" },
  jig: { num: "6", den: "8" },
};

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
   * abcjs bars a line: by its "|" delimiters.
   */
  it.each(tunes)("$title has exactly eight bars on each of its four source lines", (tune) => {
    const bodyLines = tune.abc
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^[A-Za-z]:/.test(line));
    expect(bodyLines, `"${tune.title}" should have four melody lines`).toHaveLength(4);
    for (const [i, line] of bodyLines.entries()) {
      const bars = line.split("|").filter((bar) => bar.trim().length > 0);
      expect(bars, `"${tune.title}" line ${String(i + 1)}: "${line}"`).toHaveLength(8);
    }
  });
});
