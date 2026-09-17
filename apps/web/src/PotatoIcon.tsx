import type { JSX } from "react";
import { POTATO_BEATS } from "./program.js";

/**
 * One potato, as unit `<rect>`s on a 10 × 8 grid — the spike's own bitmap.
 *
 * A "potato" is a beat of the band's count-in: four of them lead every dance,
 * which is why the tune box counts a dance in with four of these rather than
 * with a number. The joke is the point; see {@link Potatoes}.
 *
 * Drawn the way every other pixel glyph on this page is (`SpeakerGlyph`, the
 * transport): whole-number coordinates and `shape-rendering: crispEdges` in
 * the stylesheet, so it stays on the pixel grid at any size. The three classes
 * are what `hall.css` colours — outline, body, eye — and a lit potato's body
 * turns gold there.
 */
export function PotatoIcon({
  lit = false,
  now = false,
}: {
  lit?: boolean;
  now?: boolean;
}): JSX.Element {
  return (
    <svg viewBox="0 0 10 8" aria-hidden focusable="false" className={faceClass(lit, now)}>
      {POTATO_RECTS.map((rect) => (
        <rect
          key={`${rect.className}-${String(rect.x)}-${String(rect.y)}`}
          className={rect.className}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={1}
        />
      ))}
    </svg>
  );
}

/**
 * The four potatoes, lit one a beat as the band counts the dance in (AC9).
 *
 * `lit` is `potatoCount`'s answer: 0 at every beat that is not part of a
 * count-in, and 1–4 over the four beats that are. The first `lit` potatoes are
 * lit, and the last of those is the one sounding *now*, scaled a little — so
 * the row reads as a count rather than as a progress bar.
 */
export function Potatoes({ lit }: { lit: number }): JSX.Element {
  return (
    <span
      className="potatoes"
      data-testid="hall-potatoes"
      data-lit={lit}
      title="The potatoes: the four beats the band counts the dance in with"
    >
      {Array.from({ length: POTATO_BEATS }, (_unused, i) => (
        <PotatoIcon key={i} lit={i < lit} now={i === lit - 1} />
      ))}
    </span>
  );
}

const faceClass = (lit: boolean, now: boolean): string =>
  `${lit ? "lit" : ""}${now ? " now" : ""}`.trim();

/**
 * The bitmap, exactly as the spike wrote it: `#` outline, `o` body, and `.`
 * the eye where body pixels enclose it and the transparent surround where
 * they do not.
 */
const POTATO_ROWS = [
  "...####...",
  "..#oooo#..",
  ".#oooooo#.",
  "#ooo.oooo#",
  "#oooooo.o#",
  ".#o.oooo#.",
  "..#oooo#..",
  "...####...",
] as const;

interface PotatoRect {
  className: string;
  x: number;
  y: number;
  width: number;
}

/**
 * The bitmap as horizontal runs of identical pixels, one `<rect>` each.
 *
 * Run-length rather than a rect per pixel, and computed once at module load
 * rather than per render — the tune box redraws four times a beat, with four
 * potatoes in it.
 */
function potatoRects(rows: readonly string[]): PotatoRect[] {
  const rects: PotatoRect[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row[x]!;
      let width = 1;
      while (row[x + width] === char) width += 1;
      const enclosed =
        x > 0 && x + width < row.length && row[x - 1] !== "." && row[x + width] !== ".";
      if (char !== "." || enclosed) {
        const className = char === "#" ? "p-line" : char === "o" ? "p-body" : "p-eye";
        rects.push({ className, x, y, width });
      }
      x += width;
    }
  });
  return rects;
}

const POTATO_RECTS = potatoRects(POTATO_ROWS);
