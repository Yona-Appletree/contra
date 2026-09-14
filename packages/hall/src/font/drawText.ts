import type { Ctx2D } from "../renderer/Ctx2D.js";
import type { Font } from "./Font.js";

/**
 * Draw one line of text in a bitmap font, one px at a time.
 *
 * `x` and `y` are the top-left corner of the first glyph cell, in whatever
 * coordinates the context is already in — the hall draws its text in world
 * coordinates, with the origin at the centre of the world. Both should be whole
 * numbers: the whole point of a bitmap font is that its pixels land on the
 * world's pixel grid, and a half-px offset would blur every letter.
 *
 * Horizontal runs of ink are filled as one rectangle, so a line of text costs a
 * handful of fills rather than one per lit pixel.
 */
export function drawText(
  g: Ctx2D,
  font: Font,
  text: string,
  x: number,
  y: number,
  colour: string,
): void {
  g.fillStyle = colour;
  const advance = font.glyphW + 1;
  let penX = Math.round(x);
  const penY = Math.round(y);

  for (const ch of text) {
    if (ch !== " ") {
      const rows = font.glyph(ch);
      for (let row = 0; row < font.glyphH; row++) {
        const bits = rows[row] ?? 0;
        if (bits === 0) continue;
        let run = 0;
        for (let col = 0; col < font.glyphW; col++) {
          const lit = (bits & (1 << (font.glyphW - 1 - col))) !== 0;
          if (lit) {
            run++;
          } else if (run > 0) {
            g.fillRect(penX + col - run, penY + row, run, 1);
            run = 0;
          }
        }
        if (run > 0) g.fillRect(penX + font.glyphW - run, penY + row, run, 1);
      }
    }
    penX += advance;
  }
}
