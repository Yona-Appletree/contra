import { describe, expect, it } from "vitest";
import {
  PLAUSIBILITY_MARGIN,
  candidates,
  harmonise,
  inKey,
  notesOf,
  parseKey,
  plausibility,
  tokensOf,
} from "./harmonise.js";
import { tunes } from "../tunes/index.js";
import { hasteToTheWedding } from "../tunes/hasteToTheWedding.js";
import { morrisonsJig } from "../tunes/morrisonsJig.js";
import { oldJoeClark } from "../tunes/oldJoeClark.js";
import { soldiersJoy } from "../tunes/soldiersJoy.js";
import { chordPair, type ChordChart } from "../tunes/Tune.js";

const flat = (chart: ChordChart): string[][] =>
  chart.map((line) => line.map((c) => chordPair(c).join("/")));

describe("keys", () => {
  it("reads a tonic, an accidental and a mode, and derives the signature", () => {
    expect(parseKey("D")).toMatchObject({ tonic: 2, mode: "major", signature: { F: 1, C: 1 } });
    expect(parseKey("G").signature).toEqual({ F: 1 });
    expect(parseKey("Em")).toMatchObject({ tonic: 4, mode: "minor", signature: { F: 1 } });
    expect(parseKey("AMix")).toMatchObject({ mode: "mixolydian", signature: { F: 1, C: 1 } });
    expect(parseKey("Ador").mode).toBe("dorian");
    expect(parseKey("F").signature).toEqual({ B: -1 });
    expect(parseKey("Bb").signature).toEqual({ B: -1, E: -1 });
  });

  it("names the stock chords with the key's own accidentals, tonic first", () => {
    expect(candidates("D").map((c) => c.name)).toEqual(["D", "G", "A7", "Bm", "Em"]);
    expect(candidates("G").map((c) => c.name)).toEqual(["G", "C", "D7", "Em", "Am"]);
    expect(candidates("Em").map((c) => c.name)).toEqual(["Em", "D", "G", "Am", "Bm"]);
    expect(candidates("AMix").map((c) => c.name)).toEqual(["A", "G", "D", "Em", "Bm"]);
    expect(candidates("A").map((c) => c.name)).toEqual(["A", "D", "E7", "F#m", "Bm"]);
  });

  it("knows which chords are in a key", () => {
    expect(inKey("A7", "D")).toBe(true);
    expect(inKey("Bm", "D")).toBe(true);
    expect(inKey("C", "D")).toBe(false);
    expect(inKey("D7", "D")).toBe(false);
    expect(inKey("G", "AMix")).toBe(true);
    expect(inKey("E7", "AMix")).toBe(false);
    expect(inKey("D", "Em")).toBe(true);
  });
});

describe("notes of a half-bar", () => {
  it("weights by duration, doubles the first note, and applies the key signature", () => {
    // d2dc in D: D (2, doubled to 4), D (1), C sharp (1).
    expect(notesOf("d2dc", "D")).toEqual([
      { pc: 2, w: 4 },
      { pc: 2, w: 1 },
      { pc: 1, w: 1 },
    ]);
    // F in D is F sharp; an explicit natural or flat overrides.
    expect(notesOf("F", "D")[0]?.pc).toBe(6);
    expect(notesOf("=F", "D")[0]?.pc).toBe(5);
    expect(notesOf("_B", "C")[0]?.pc).toBe(10);
    expect(notesOf("^G", "C")[0]?.pc).toBe(8);
  });

  it("skips rests, reads fractions, and rejects anything that is not a note", () => {
    expect(notesOf("d2z2", "D")).toEqual([{ pc: 2, w: 4 }]);
    expect(tokensOf("d/2e/")).toEqual([
      { kind: "note", letter: "D", accidental: "", duration: 0.5 },
      { kind: "note", letter: "E", accidental: "", duration: 0.5 },
    ]);
    expect(tokensOf("D3")).toEqual([{ kind: "note", letter: "D", accidental: "", duration: 3 }]);
    expect(() => tokensOf('"D"d2dc')).toThrow(/unreadable ABC/);
    expect(() => tokensOf("d2|dc")).toThrow(/unreadable ABC/);
  });
});

describe("harmonise: a draft chart from the melody alone", () => {
  it("drafts four lines of eight bars, in key", () => {
    for (const tune of tunes) {
      const chart = harmonise(tune);
      expect(chart, tune.slug).toHaveLength(4);
      for (const line of chart) {
        expect(line, tune.slug).toHaveLength(8);
        for (const bar of line) {
          for (const chord of chordPair(bar)) expect(inKey(chord, tune.key), tune.slug).toBe(true);
        }
      }
    }
  });

  it("leans on the tonic at a phrase end, unless the melody plainly cadences elsewhere", () => {
    for (const tune of [soldiersJoy, morrisonsJig, oldJoeClark, hasteToTheWedding]) {
      const tonic = candidates(tune.key)[0]?.name;
      for (const line of harmonise(tune))
        expect(chordPair(line[7] ?? "")[1], tune.slug).toBe(tonic);
    }
    // Arkansas Traveler's A part, as typed, ends on the dominant's own notes
    // (`cAA2`); the bonus for the tonic is a lean, not a rule, and the draft
    // follows the notes.
    expect(flat(harmonise(tunes.find((t) => t.slug === "arkansas-traveler")!))[0]?.[7]).toBe(
      "A7/A7",
    );
  });

  it("hears the obvious: Soldier's Joy opens on D and its B part goes to G", () => {
    const chart = flat(harmonise(soldiersJoy));
    expect(chart[0]?.[0]).toBe("D/D");
    expect(chart[0]?.[2]).toBe("A7/A7");
    expect(chart[2]?.[1]).toBe("G/G");
  });

  it("works in a minor key and in mixolydian", () => {
    expect(flat(harmonise(morrisonsJig))[0]?.[0]).toBe("Em/Em");
    expect(flat(harmonise(morrisonsJig))[0]?.[1]).toBe("D/Em");
    expect(flat(harmonise(oldJoeClark))[0]?.[0]).toBe("A/A");
    expect(flat(harmonise(oldJoeClark))[0]?.[1]).toBe("G/A");
  });

  it("is not the hand chart: the two are allowed to disagree", () => {
    // The hand chart keeps A7 through Soldier's Joy's seventh bar; the draft
    // resolves to D on its second half. Both are plausible; neither is "the"
    // chart. This test exists so nobody turns the plausibility test into an
    // equality test later.
    expect(flat(harmonise(soldiersJoy))[0]?.[6]).toBe("A7/D");
    expect(chordPair(soldiersJoy.chords[0]?.[6] ?? "")).toEqual(["A7", "A7"]);
  });
});

describe("plausibility: every hand chord is within the margin of the best stock chord", () => {
  it.each(tunes)("$title's chart is plausible", (tune) => {
    const reports = plausibility(tune);
    expect(reports.length).toBeGreaterThanOrEqual(32);
    for (const r of reports) {
      const where = `${tune.slug} line ${String(r.line)} bar ${String(r.bar)}${
        r.half === undefined ? "" : ` half ${String(r.half)}`
      }: hand ${r.hand}, best ${r.best}`;
      expect(r.gap, where).toBeLessThanOrEqual(PLAUSIBILITY_MARGIN);
    }
  });

  it("scores a whole-bar chord over the whole bar, and a pair over its halves", () => {
    const reports = plausibility(hasteToTheWedding);
    expect(reports.filter((r) => r.line === 0 && r.bar === 0)).toEqual([
      { line: 0, bar: 0, hand: "D", best: "D", gap: 0 },
    ]);
    expect(reports.filter((r) => r.line === 0 && r.bar === 2).map((r) => r.half)).toEqual([0, 1]);
  });

  it("passes a taste call: Am where the notes fit C just as well", () => {
    const c = plausibility({ key: "G", lines: ["c2e c3|", "", "", ""], chords: [["C"]] });
    const am = plausibility({ key: "G", lines: ["c2e c3|", "", "", ""], chords: [["Am"]] });
    expect(c[0]?.gap).toBe(0);
    expect(am[0]?.gap).toBe(0);
  });

  it("passes the widest taste call the bundled charts make, with room to spare", () => {
    // Haste to the Wedding's bar 7, "efg fdc" under the standard G–A7 cadence:
    // the scorer, which knows only chord tones, opens the widest gap any
    // bundled chart has. It is the reference for where the margin sits.
    const widest = Math.max(...tunes.flatMap((t) => plausibility(t).map((r) => r.gap)));
    expect(widest).toBeCloseTo(3.2, 5);
    expect(widest).toBeLessThan(PLAUSIBILITY_MARGIN - 0.5);
  });

  it("fails a typo: an A7 where Soldier's Joy opens on D, and a D under a jig's held G", () => {
    const typo = plausibility({
      ...soldiersJoy,
      chords: [["A7", ...soldiersJoy.chords[0]!.slice(1)], ...soldiersJoy.chords.slice(1)],
    });
    expect(typo[0]?.gap).toBeGreaterThan(PLAUSIBILITY_MARGIN + 4);
    // The Kesh Jig's fourth bar as the spike first charted it: a D under the
    // G the melody holds for the whole second half.
    const held = plausibility({ key: "G", lines: ["c2A G3|", "", "", ""], chords: [[["C", "D"]]] });
    expect(held[1]?.gap).toBeCloseTo(9.6, 5);
    expect(held[1]?.gap).toBeGreaterThan(PLAUSIBILITY_MARGIN + 4);
    // What the test cannot catch: a wrong chord that shares a tone with the
    // notes. A G over Soldier's Joy's `d2fa` opens the same gap as the
    // widest taste call in the bundled charts, and passes.
    const shared = plausibility({
      key: "D",
      lines: ["d2fa d2fa|", "", "", ""],
      chords: [[["G", "D"]]],
    });
    expect(shared[0]?.gap).toBeCloseTo(3.2, 5);
    expect(shared[0]?.gap).toBeLessThan(PLAUSIBILITY_MARGIN);
  });
});
