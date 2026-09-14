import type { TraceDraw, TraceDrawOptions } from "./traceSvg.js";
import {
  escapeText,
  inkOf,
  inkRuns,
  label,
  line,
  num,
  polyline,
  spreadOffset,
  traceDraw,
  traceSvg,
} from "./traceSvg.js";
import type { TraceView, TraceViewCell } from "./TraceView.js";

/**
 * The figure strip: one small pen plot per call, the cell as wide as the call
 * is long, the figure's name underneath.
 *
 * This is the view that solves the problem the other three have — figures of
 * different lengths overdrawing each other — by giving every call its own
 * patch of floor, and it is the one a caller reads a card with. The cell's
 * wash is the figure's own colour, so a dance that dances the same figure twice
 * says so twice in the same paint.
 */
export function figureStripSvg(trace: TraceView, options: FigureStripOptions = {}): string {
  const draw = traceDraw(options);
  const beatPx = options.beatPx ?? 9;
  const cellHeight = options.cellHeight ?? 56;
  const padLeft = options.padLeft ?? 8;
  const padRight = options.padRight ?? 8;
  const captionHeight = draw.labels ? (options.captionHeight ?? 14) : 0;
  const beats = trace.to - trace.from;
  const width = options.width ?? padLeft + beats * beatPx + padRight;
  const height = cellHeight + captionHeight;

  const reach = Math.max(trace.extent.x, trace.extent.y, 1);
  const scale = Math.min(STRIP_MAX_SCALE, (cellHeight - 6) / (2 * reach));

  const parts: string[] = [];
  for (const cell of trace.cells) {
    const x = padLeft + (cell.from - trace.from) * beatPx;
    const w = (cell.to - cell.from) * beatPx;
    if (w <= 0) continue;
    const wash = draw.colourOf(cell.family);
    parts.push(cellPlot(trace, cell, draw, scale, x, w, cellHeight, wash));
    parts.push(line([x, 0], [x, cellHeight], draw.palette.grid, 1));
    if (draw.labels) {
      parts.push(cellCaption(draw.nameOf(cell.figure), x, cellHeight, w, captionHeight, wash));
    }
  }
  for (let beat = trace.from + draw.phraseBeats; beat < trace.to - 1e-9; beat += draw.phraseBeats) {
    const x = padLeft + (beat - trace.from) * beatPx;
    parts.push(line([x, 0], [x, cellHeight], draw.palette.rule, 1.5));
  }
  if (draw.title !== undefined) parts.push(label([2, 9], draw.title, draw.palette.text, 9));
  return traceSvg(width, height, parts.join(""), draw.palette.ground);
}

/** What a figure strip takes on top of the shared options. */
export interface FigureStripOptions extends TraceDrawOptions {
  /** How wide one beat of a cell is, px. */
  beatPx?: number;
  /** How tall the plots are, above the captions. */
  cellHeight?: number;
  /** How tall the caption row is. */
  captionHeight?: number;
  width?: number;
  padLeft?: number;
  padRight?: number;
}

/** The most a cell's plot is ever magnified; see the pen plot's own cap. */
export const STRIP_MAX_SCALE = 2.6;

/** How faint the cell's wash is behind the ink. */
export const STRIP_WASH_OPACITY = 0.18;

/**
 * One cell: a washed patch of floor with just this call's ink on it.
 *
 * Drawn inside a nested `<svg>`, which clips to its own viewport with no
 * `clipPath` and so no generated id — two strips on one page can never collide.
 */
function cellPlot(
  trace: TraceView,
  cell: TraceViewCell,
  draw: TraceDraw,
  scale: number,
  x: number,
  w: number,
  h: number,
  wash: string,
): string {
  const parts = [
    `<rect width="${num(w)}" height="${num(h)}" fill="${wash}"` +
      ` fill-opacity="${String(STRIP_WASH_OPACITY)}"/>`,
  ];
  const cx = w / 2;
  const cy = h / 2;
  trace.pens.forEach((pen, index) => {
    const [dx, dy] = spreadOffset(draw, index, trace.pens.length);
    const map = (sample: TraceView["pens"][number]["samples"][number]) =>
      [cx + sample.p[0] * scale + dx, cy + sample.p[1] * scale + dy] as [number, number];
    const runs = inkRuns(pen, map, { window: { from: cell.from, to: cell.to } });
    for (const run of runs) parts.push(polyline(run, inkOf(pen), draw.penWidth));
  });
  return (
    `<svg x="${num(x)}" y="0" width="${num(w)}" height="${num(h)}"` +
    ` viewBox="0 0 ${num(w)} ${num(h)}">${parts.join("")}</svg>`
  );
}

/** The figure's name under its cell, on a bar of the cell's own colour. */
function cellCaption(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  wash: string,
): string {
  const text =
    `<text x="3" y="${num(h - 4)}" fill="#1d1510" font-size="9"` +
    ` font-family="ui-monospace, Menlo, monospace">${escapeText(name)}</text>`;
  return (
    `<svg x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"` +
    ` viewBox="0 0 ${num(w)} ${num(h)}">` +
    `<rect x="0.5" width="${num(Math.max(0, w - 1))}" height="${num(h)}" fill="${wash}"/>` +
    text +
    `</svg>`
  );
}
