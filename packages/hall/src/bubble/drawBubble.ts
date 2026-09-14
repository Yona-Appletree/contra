import type { Vec2 } from "@caller/core";
import type { Font } from "../font/Font.js";
import { textWidth } from "../font/Font.js";
import { drawText } from "../font/drawText.js";
import { LINE_ADVANCE_PX } from "../font/glyphs.js";
import type { Ctx2D } from "../renderer/Ctx2D.js";
import type { World } from "../renderer/World.js";

/** Paper, ink, border and the hard shadow the bubble drops on the hall. */
export const BUBBLE_PAPER = "#efe6d0";
export const BUBBLE_INK = "#1b1410";
export const BUBBLE_BORDER = "#1b1410";
export const BUBBLE_SHADOW = "rgba(0,0,0,0.35)";

/** Blank px between the border and the text, on every side. */
export const BUBBLE_PADDING_PX = 2;

/** How tall the tail is, and how wide where it meets the box. */
export const BUBBLE_TAIL_PX = 3;

/** Px kept between the bubble and the edge of the world. */
export const BUBBLE_MARGIN_PX = 2;

/** The default wrap width, in glyph cells. */
export const BUBBLE_MAX_COLS = 22;

export interface BubbleOptions {
  /** Wrap the text at this many glyph cells. Default {@link BUBBLE_MAX_COLS}. */
  maxCols?: number;
  /** Which side the tail leaves from. Default `"down"`. */
  tail?: "down" | "left";
  /** The world to stay inside. Left out, the bubble is not clamped. */
  world?: World;
}

/** Where a laid-out bubble ended up, in world coordinates. */
export interface BubbleBox {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

/**
 * Draw the caller's speech bubble: a rounded, one-px-bordered box of paper with
 * a one-px shadow, the call wrapped inside it in the bitmap font, and a tail
 * pointing back at whoever is speaking.
 *
 * The bubble is pixels. Crisp HTML text over pixel graphics was rejected, so
 * every letter here is drawn on the canvas out of {@link Font}.
 *
 * `anchor` is the point the tail points at — the caller's head. Given
 * `opts.world`, the bubble is drawn in **world coordinates**, with the origin
 * at the centre of that world and the box clamped inside it, exactly as
 * `drawFloor` and `drawFurniture` do; without one it is drawn in whatever
 * coordinates the context is already in and not clamped.
 */
export function drawBubble(
  g: Ctx2D,
  font: Font,
  text: string,
  anchor: Vec2,
  opts: BubbleOptions = {},
): BubbleBox {
  const box = layoutBubble(font, text, anchor, opts);
  const tail = opts.tail ?? "down";
  const world = opts.world;

  g.save();
  if (world !== undefined) g.setTransform(1, 0, 0, 1, world.w / 2, world.h / 2);

  // The hard shadow, one px down and right, under everything.
  g.fillStyle = BUBBLE_SHADOW;
  fillRounded(g, box.x + 1, box.y + 1, box.w, box.h);

  g.fillStyle = BUBBLE_BORDER;
  fillRounded(g, box.x, box.y, box.w, box.h);
  g.fillStyle = BUBBLE_PAPER;
  fillRounded(g, box.x + 1, box.y + 1, box.w - 2, box.h - 2);

  drawTail(g, box, anchor, tail);

  const textX = box.x + 1 + BUBBLE_PADDING_PX;
  const textY = box.y + 1 + BUBBLE_PADDING_PX;
  box.lines.forEach((line, i) => {
    drawText(g, font, line, textX, textY + i * LINE_ADVANCE_PX, BUBBLE_INK);
  });

  g.restore();
  return box;
}

/**
 * Where the bubble for this call would sit, without drawing it. Exported so
 * tests and the demo page can ask whether a bubble fits before it appears.
 */
export function layoutBubble(
  font: Font,
  text: string,
  anchor: Vec2,
  opts: BubbleOptions = {},
): BubbleBox {
  const maxCols = opts.maxCols ?? BUBBLE_MAX_COLS;
  const tail = opts.tail ?? "down";
  const lines = wrapText(text, maxCols);
  const widest = lines.reduce((n, line) => Math.max(n, textWidth(font, line)), 0);

  const w = widest + 2 * BUBBLE_PADDING_PX + 2;
  const h = lines.length * LINE_ADVANCE_PX - 1 + 2 * BUBBLE_PADDING_PX + 2;

  let x: number;
  let y: number;
  if (tail === "down") {
    x = Math.round(anchor[0] - w / 2);
    y = Math.round(anchor[1] - BUBBLE_TAIL_PX - h - 4);
  } else {
    x = Math.round(anchor[0] + BUBBLE_TAIL_PX + 4);
    y = Math.round(anchor[1] - h / 2);
  }

  const world = opts.world;
  if (world !== undefined) {
    const left = -world.w / 2 + BUBBLE_MARGIN_PX;
    const top = -world.h / 2 + BUBBLE_MARGIN_PX;
    x = clamp(x, left, left + world.w - 2 * BUBBLE_MARGIN_PX - w);
    y = clamp(y, top, top + world.h - 2 * BUBBLE_MARGIN_PX - h);
  }

  return { x, y, w, h, lines };
}

/**
 * Break a call into lines of at most `maxCols` glyph cells, at spaces. A single
 * word longer than `maxCols` is hard-broken rather than pushed off the bubble.
 */
export function wrapText(text: string, maxCols: number): string[] {
  const cols = Math.max(1, Math.floor(maxCols));
  const lines: string[] = [];
  let line = "";

  const push = (): void => {
    lines.push(line);
    line = "";
  };

  for (const word of text.trim().split(/\s+/)) {
    if (word === "") continue;
    let rest = word;
    while (rest.length > cols) {
      if (line !== "") push();
      lines.push(rest.slice(0, cols));
      rest = rest.slice(cols);
    }
    if (line === "") {
      line = rest;
    } else if (line.length + 1 + rest.length <= cols) {
      line = `${line} ${rest}`;
    } else {
      push();
      line = rest;
    }
  }
  if (line !== "" || lines.length === 0) lines.push(line);
  return lines;
}

/** A filled rectangle with its four corner pixels left out. */
function fillRounded(g: Ctx2D, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  if (w <= 2 || h <= 2) {
    g.fillRect(x, y, w, h);
    return;
  }
  g.fillRect(x + 1, y, w - 2, 1);
  g.fillRect(x, y + 1, w, h - 2);
  g.fillRect(x + 1, y + h - 1, w - 2, 1);
}

/**
 * The tail: three rows (or columns) narrowing away from the box towards the
 * anchor, outlined on both edges so it reads as part of the same border. The
 * first row sits on the box's own border row and the paper punches through it,
 * which is what joins the tail to the inside of the bubble.
 */
function drawTail(g: Ctx2D, box: BubbleBox, anchor: Vec2, tail: "down" | "left"): void {
  const span = BUBBLE_TAIL_PX + 1;

  if (tail === "down") {
    const from = clamp(Math.round(anchor[0]) - 1, box.x + 2, box.x + box.w - 2 - span);
    for (let i = 0; i < BUBBLE_TAIL_PX; i++) {
      const width = span - i;
      const y = box.y + box.h - 1 + i;
      g.fillStyle = BUBBLE_SHADOW;
      g.fillRect(from + 1, y + 1, width, 1);
      g.fillStyle = BUBBLE_BORDER;
      g.fillRect(from, y, width, 1);
      if (width > 2 && i < BUBBLE_TAIL_PX - 1) {
        g.fillStyle = BUBBLE_PAPER;
        g.fillRect(from + 1, y, width - 2, 1);
      }
    }
    return;
  }

  const from = clamp(Math.round(anchor[1]) - 1, box.y + 2, box.y + box.h - 2 - span);
  for (let i = 0; i < BUBBLE_TAIL_PX; i++) {
    const height = span - i;
    const x = box.x - i;
    g.fillStyle = BUBBLE_SHADOW;
    g.fillRect(x + 1, from + 1, 1, height);
    g.fillStyle = BUBBLE_BORDER;
    g.fillRect(x, from, 1, height);
    if (height > 2 && i < BUBBLE_TAIL_PX - 1) {
      g.fillStyle = BUBBLE_PAPER;
      g.fillRect(x, from + 1, 1, height - 2);
    }
  }
}

const clamp = (v: number, lo: number, hi: number): number =>
  hi < lo ? lo : v < lo ? lo : v > hi ? hi : v;
