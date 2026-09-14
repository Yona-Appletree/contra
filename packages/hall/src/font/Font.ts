import {
  CHAR_ADVANCE_PX,
  GLYPHS,
  GLYPH_H,
  GLYPH_W,
  LINE_ADVANCE_PX,
  MISSING_GLYPH,
} from "./glyphs.js";

/**
 * A bitmap font: fixed-size glyphs as rows of bits.
 *
 * Text in the hall is pixels, never HTML text over the canvas — crisp vector
 * text on pixel graphics was rejected outright, so the caller's bubble draws
 * every letter out of this font one px at a time.
 *
 * `glyph(ch)` returns {@link Font.glyphH} bytes, one per row, with column `x`
 * set when `row & (1 << (glyphW - 1 - x))` is non-zero — the leftmost column is
 * the high bit. The arrays are shared and frozen in spirit: do not write to one.
 */
export interface Font {
  /** Glyph cell width in px. */
  readonly glyphW: 4;
  /** Glyph cell height in px. */
  readonly glyphH: 6;
  /**
   * The rows of one character's glyph. Lowercase is drawn as uppercase; a
   * character the font does not have draws as a hollow box.
   */
  glyph(ch: string): Uint8Array;
  /** Whether this character has a glyph of its own (after upper-casing). */
  has(ch: string): boolean;
}

/** The one font: 4 × 6, uppercase, digits, a little punctuation. */
export const FONT: Font = createFont();

/**
 * How wide a single line of text is in px, with no trailing letter gap. Text
 * with no characters is 0 px wide.
 */
export function textWidth(font: Font, text: string): number {
  const n = [...text].length;
  return n === 0 ? 0 : n * (font.glyphW + 1) - 1;
}

/** How tall `lines` lines of text are in px, with no trailing line gap. */
export function textHeight(font: Font, lines: number): number {
  return lines === 0 ? 0 : lines * (font.glyphH + 1) - 1;
}

function createFont(): Font {
  const cache = new Map<string, Uint8Array>();
  const missing = pack(MISSING_GLYPH);

  const key = (ch: string): string => ch.toUpperCase();

  return {
    glyphW: GLYPH_W,
    glyphH: GLYPH_H,
    glyph(ch) {
      const k = key(ch);
      const hit = cache.get(k);
      if (hit !== undefined) return hit;
      const rows = GLYPHS[k];
      if (rows === undefined) return missing;
      const packed = pack(rows);
      cache.set(k, packed);
      return packed;
    },
    has(ch) {
      return GLYPHS[key(ch)] !== undefined;
    },
  };
}

/** Turn six rows of `#`/`.` into six bytes, leftmost column in the high bit. */
function pack(rows: readonly string[]): Uint8Array {
  if (rows.length !== GLYPH_H) {
    throw new Error(`hall: a glyph is ${GLYPH_H} rows, got ${rows.length}`);
  }
  const out = new Uint8Array(GLYPH_H);
  for (let y = 0; y < GLYPH_H; y++) {
    const row = rows[y] ?? "";
    if (row.length !== GLYPH_W) {
      throw new Error(`hall: a glyph row is ${GLYPH_W} columns, got "${row}"`);
    }
    let bits = 0;
    for (let x = 0; x < GLYPH_W; x++) {
      if (row[x] === "#") bits |= 1 << (GLYPH_W - 1 - x);
    }
    out[y] = bits;
  }
  return out;
}

export { CHAR_ADVANCE_PX, GLYPH_H, GLYPH_W, LINE_ADVANCE_PX };
