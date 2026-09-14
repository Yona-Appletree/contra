import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHAR_ADVANCE_PX, FONT, LINE_ADVANCE_PX, textHeight, textWidth } from "./Font.js";
import { drawText } from "./drawText.js";
import { GLYPHS, MISSING_GLYPH } from "./glyphs.js";

/**
 * The vocabulary the bubble has to be able to say: every dance title in the
 * corpus, plus the figure calls from the milestone contract. If a character
 * here has no glyph, the bubble would draw a missing-glyph box in the middle of
 * a call.
 */
const CORPUS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../data/corpus/demo-dances.json",
);

const FIGURE_CALLS = [
  "NEIGHBORS BALANCE & SWING",
  "CIRCLE LEFT ¾",
  "ROBINS CHAIN",
  "LONG LINES FORWARD & BACK",
  "HANDS FOUR FROM THE TOP",
  "DO-SI-DO YOUR PARTNER",
  "ALLEMANDE RIGHT ONCE AND A HALF",
  "PETRONELLA TURN, BALANCE THE RING",
  "GENTS ALLEMANDE LEFT ½",
  "SLIDE LEFT ¼, HANDS FOUR!",
  "READY? LADIES' CHAIN 90°",
];

describe("the 4 × 6 bitmap font", () => {
  it("is 4 × 6 for every glyph, with no stray columns or rows", () => {
    expect(FONT.glyphW).toBe(4);
    expect(FONT.glyphH).toBe(6);
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows, `glyph "${ch}" is not ${FONT.glyphH} rows`).toHaveLength(FONT.glyphH);
      for (const row of rows) {
        expect(row, `glyph "${ch}" has a row that is not ${FONT.glyphW} columns`).toHaveLength(
          FONT.glyphW,
        );
        expect(row, `glyph "${ch}" uses a character other than # and .`).toMatch(/^[#.]+$/);
      }
      const packed = FONT.glyph(ch);
      expect(packed).toHaveLength(FONT.glyphH);
      for (const bits of packed) expect(bits).toBeLessThan(1 << FONT.glyphW);
    }
  });

  it("holds the characters the contract names", () => {
    const contract = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&',.?!-½¾¼° ";
    for (const ch of contract) expect(FONT.has(ch), `missing "${ch}"`).toBe(true);
  });

  it("draws lowercase as uppercase", () => {
    for (const upper of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      expect(FONT.glyph(upper.toLowerCase())).toEqual(FONT.glyph(upper));
    }
  });

  it("renders every character of the call vocabulary with no missing-glyph box", () => {
    const dances = JSON.parse(readFileSync(CORPUS, "utf8")) as Array<{ title: string }>;
    const vocabulary = [...dances.map((d) => d.title.toUpperCase()), ...FIGURE_CALLS];
    // A character the font has no glyph for draws the hollow box instead.
    const box = FONT.glyph("§");
    expect(FONT.has("§")).toBe(false);
    expect(box).toEqual(pack(MISSING_GLYPH));

    for (const phrase of vocabulary) {
      for (const ch of phrase) {
        expect(FONT.has(ch), `"${phrase}" needs a glyph for "${ch}"`).toBe(true);
        expect(FONT.glyph(ch), `"${phrase}" draws the missing-glyph box for "${ch}"`).not.toEqual(
          box,
        );
      }
    }
  });

  it("gives distinct shapes to the letters that are easiest to confuse", () => {
    const groups = ["MWNH", "UVO0", "IT1", "8B", "5S", "2Z", "½¾¼"];
    for (const group of groups) {
      const seen = new Set<string>();
      for (const ch of group) seen.add([...FONT.glyph(ch)].join(","));
      expect(seen.size, `${group} are not all distinct`).toBe(group.length);
    }
  });

  it("advances 5 px per character and 7 px per line", () => {
    expect(CHAR_ADVANCE_PX).toBe(5);
    expect(LINE_ADVANCE_PX).toBe(7);
    expect(textWidth(FONT, "")).toBe(0);
    expect(textWidth(FONT, "A")).toBe(4);
    expect(textWidth(FONT, "AB")).toBe(9);
    expect(textHeight(FONT, 0)).toBe(0);
    expect(textHeight(FONT, 1)).toBe(6);
    expect(textHeight(FONT, 2)).toBe(13);
  });
});

describe("drawText", () => {
  it("fills exactly the lit pixels of each glyph, in runs", () => {
    const g = recorder();
    drawText(g.ctx, FONT, "A", 10, 20, "#fff");
    expect(g.fillStyle).toBe("#fff");
    // "A" is ".##. / #..# / #### / #..# / #..#": 1 run, 2, 1, 2, 2.
    expect(g.rects).toEqual([
      [11, 20, 2, 1],
      [10, 21, 1, 1],
      [13, 21, 1, 1],
      [10, 22, 4, 1],
      [10, 23, 1, 1],
      [13, 23, 1, 1],
      [10, 24, 1, 1],
      [13, 24, 1, 1],
    ]);
  });

  it("draws nothing for a space and still advances the pen", () => {
    const blank = recorder();
    drawText(blank.ctx, FONT, "  ", 0, 0, "#fff");
    expect(blank.rects).toHaveLength(0);

    const spaced = recorder();
    drawText(spaced.ctx, FONT, " A", 0, 0, "#fff");
    const plain = recorder();
    drawText(plain.ctx, FONT, "A", CHAR_ADVANCE_PX, 0, "#fff");
    expect(spaced.rects).toEqual(plain.rects);
  });
});

function pack(rows: readonly string[]): Uint8Array {
  const out = new Uint8Array(rows.length);
  rows.forEach((row, y) => {
    let bits = 0;
    for (let x = 0; x < row.length; x++) if (row[x] === "#") bits |= 1 << (row.length - 1 - x);
    out[y] = bits;
  });
  return out;
}

/** A context that records the fills a draw made, for tests with no canvas. */
function recorder(): { ctx: Parameters<typeof drawText>[0]; rects: number[][]; fillStyle: string } {
  const rects: number[][] = [];
  const state = { fillStyle: "" };
  const ctx = {
    set fillStyle(v: string) {
      state.fillStyle = v;
    },
    get fillStyle(): string {
      return state.fillStyle;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push([x, y, w, h]);
    },
  } as unknown as Parameters<typeof drawText>[0];
  return {
    ctx,
    rects,
    get fillStyle() {
      return state.fillStyle;
    },
  };
}
