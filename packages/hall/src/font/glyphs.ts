/**
 * The hall's own 4 × 6 bitmap font, drawn as pixel art.
 *
 * Our own data: no third-party bitmap font is vendored or copied. Each glyph is
 * six rows of four columns, written here as `#` (ink) and `.` (paper) so the
 * shapes can be read and edited as shapes. Rows 0 to 4 are the cap height; row
 * 5 is the descender row, used only by `,` and `Q`.
 *
 * The vocabulary is what a caller's bubble needs: uppercase letters, digits,
 * `& ' , . ? ! -`, the three fractions a call ever uses (`½ ¾ ¼`) and `°`.
 * Lowercase is drawn as uppercase — see {@link Font}.
 */

/** Glyph cell width in px. The advance adds {@link LETTER_SPACING_PX}. */
export const GLYPH_W = 4;

/** Glyph cell height in px. The line advance adds {@link LINE_SPACING_PX}. */
export const GLYPH_H = 6;

/** Blank columns between two glyphs on a line. */
export const LETTER_SPACING_PX = 1;

/** Blank rows between two lines of text. */
export const LINE_SPACING_PX = 1;

/** What one character advances the pen by. */
export const CHAR_ADVANCE_PX = GLYPH_W + LETTER_SPACING_PX;

/** What one line advances the pen by. */
export const LINE_ADVANCE_PX = GLYPH_H + LINE_SPACING_PX;

/**
 * Every glyph, as six four-character rows.
 *
 * Narrow glyphs (`I`, `T`, `Y`, `1`, `!`) hang their stem on column 1: a cell
 * of even width has no true centre, and putting every stem on the same column
 * keeps them looking like one family rather than drifting left and right.
 *
 * The fractions are the one real compromise of a 4 px cell. Each is a four-px
 * diagonal with the numerator in the top-left 2 × 3 and the denominator in the
 * bottom-right 2 × 3; the three are distinguishable from each other and read as
 * fraction marks, but they are marks, not typography.
 */
export const GLYPHS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  " ": ["....", "....", "....", "....", "....", "...."],

  A: [".##.", "#..#", "####", "#..#", "#..#", "...."],
  B: ["###.", "#..#", "###.", "#..#", "###.", "...."],
  C: [".##.", "#..#", "#...", "#..#", ".##.", "...."],
  D: ["###.", "#..#", "#..#", "#..#", "###.", "...."],
  E: ["####", "#...", "###.", "#...", "####", "...."],
  F: ["####", "#...", "###.", "#...", "#...", "...."],
  G: [".##.", "#...", "#.##", "#..#", ".##.", "...."],
  H: ["#..#", "#..#", "####", "#..#", "#..#", "...."],
  I: ["###.", ".#..", ".#..", ".#..", "###.", "...."],
  J: ["...#", "...#", "...#", "#..#", ".##.", "...."],
  K: ["#..#", "#.#.", "##..", "#.#.", "#..#", "...."],
  L: ["#...", "#...", "#...", "#...", "####", "...."],
  M: ["#..#", "####", "####", "#..#", "#..#", "...."],
  N: ["#..#", "##.#", "#.##", "#..#", "#..#", "...."],
  O: [".##.", "#..#", "#..#", "#..#", ".##.", "...."],
  P: ["###.", "#..#", "###.", "#...", "#...", "...."],
  Q: [".##.", "#..#", "#..#", "#.#.", ".##.", "...#"],
  R: ["###.", "#..#", "###.", "#.#.", "#..#", "...."],
  S: [".###", "#...", ".##.", "...#", "###.", "...."],
  T: ["####", ".#..", ".#..", ".#..", ".#..", "...."],
  U: ["#..#", "#..#", "#..#", "#..#", "####", "...."],
  V: ["#..#", "#..#", "#..#", "#..#", ".##.", "...."],
  W: ["#..#", "#..#", "####", "####", "#..#", "...."],
  X: ["#..#", "#..#", ".##.", "#..#", "#..#", "...."],
  Y: ["#..#", "#..#", ".##.", ".#..", ".#..", "...."],
  Z: ["####", "..#.", ".#..", "#...", "####", "...."],

  "0": [".##.", "#.##", "##.#", "#..#", ".##.", "...."],
  "1": [".#..", "##..", ".#..", ".#..", "###.", "...."],
  "2": ["###.", "...#", ".##.", "#...", "####", "...."],
  "3": ["###.", "...#", ".##.", "...#", "###.", "...."],
  "4": ["#..#", "#..#", "####", "...#", "...#", "...."],
  "5": ["####", "#...", "###.", "...#", "###.", "...."],
  "6": [".##.", "#...", "###.", "#..#", ".##.", "...."],
  "7": ["####", "...#", "..#.", ".#..", ".#..", "...."],
  "8": [".##.", "#..#", ".##.", "#..#", ".##.", "...."],
  "9": [".##.", "#..#", ".###", "...#", ".##.", "...."],

  "&": [".#..", "#.#.", ".#..", "#.#.", ".#.#", "...."],
  "'": [".#..", ".#..", "....", "....", "....", "...."],
  ",": ["....", "....", "....", "....", ".#..", "#..."],
  ".": ["....", "....", "....", "....", ".#..", "...."],
  "?": [".##.", "#..#", "..#.", "....", "..#.", "...."],
  "!": [".#..", ".#..", ".#..", "....", ".#..", "...."],
  "-": ["....", "....", ".##.", "....", "....", "...."],
  "°": [".##.", "#..#", ".##.", "....", "....", "...."],

  "½": ["#...", "#..#", "#.#.", ".###", "#..#", "..##"],
  "¼": ["#...", "#..#", "#.#.", ".##.", "#.##", "...#"],
  "¾": ["##..", ".#.#", "###.", ".###", "#..#", "..##"],
});

/**
 * What a character with no glyph draws as: a hollow box. The font tests assert
 * that no character in the call vocabulary reaches it.
 */
export const MISSING_GLYPH: readonly string[] = ["####", "#..#", "#..#", "#..#", "####", "...."];
