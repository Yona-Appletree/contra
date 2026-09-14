import type { Beat, Vec2 } from "@caller/core";
import type { TraceDraw, TraceDrawOptions } from "./traceSvg.js";
import {
  box,
  dot,
  facingMarks,
  inkOf,
  inkRuns,
  label,
  line,
  polyline,
  spreadOffset,
  traceDraw,
  traceSvg,
} from "./traceSvg.js";
import type { TraceView, TraceViewPen } from "./TraceView.js";

/**
 * The pen plot: the whole window on the set, every dancer a pen.
 *
 * One square of floor seen from the band's side — the set runs down the page,
 * the band's rail is the bar across the top — with the ink laid down exactly
 * where the engine walked the feet. The post's plate of this was drawn by
 * sixteen hand-written path functions; this one is `poseAt`, so a pass really
 * passes, a courtesy turn really turns, and a becket dance's slide leaves ink
 * instead of a gap.
 *
 * Two things the post's plates could not do: the four pens are nudged apart by
 * a hair (see `TraceSpread`), so the last one drawn does not bury the other
 * three, and a tick on every beat says which way the dancer was facing.
 */
export function penPlotSvg(trace: TraceView, options: PenPlotOptions = {}): string {
  const draw = traceDraw(options);
  const width = options.width ?? PEN_PLOT_SIDE;
  const height = options.height ?? PEN_PLOT_SIDE;
  const pad = options.pad ?? PEN_PLOT_PAD;
  const marks = options.marks ?? true;

  // A facing mark is drawn out of the path — a tick's tip, a wake's outer
  // edge or an arrowhead's point, whichever `draw.facing` asks for, all the
  // same `facingPx` reach — so the margin has to hold one.
  const plot = penPlotMap(trace, width, height, pad + draw.facingPx, options.reach);
  const parts: string[] = [];

  if (marks) parts.push(setMarks(trace, plot, draw.palette.grid, draw.palette.mark));
  const window = options.window;
  trace.pens.forEach((pen, index) => {
    const ink = inkOf(pen);
    const map = plot.penMap(pen, index, draw, trace.pens.length);
    for (const run of inkRuns(pen, map, window === undefined ? {} : { window })) {
      parts.push(polyline(run, ink, draw.penWidth));
    }
    parts.push(facingMarks(pen, index, map, draw, ink));
    const first = pen.samples[0];
    if (first !== undefined) parts.push(dot(map(first), draw.penWidth + 0.8, ink));
  });
  if (draw.title !== undefined) parts.push(label([4, 11], draw.title, draw.palette.text, 9));
  return traceSvg(width, height, parts.join(""), draw.palette.ground);
}

/** What a pen plot takes on top of the shared options. */
export interface PenPlotOptions extends TraceDrawOptions {
  width?: number;
  height?: number;
  /** Blank margin around the ink, px. */
  pad?: number;
  /** The set's box, the starting stations and the band's rail. Default true. */
  marks?: boolean;
  /** Only this beat window's ink. Default: the whole trace. */
  window?: { from: Beat; to: Beat };
  /**
   * The floor half-extent to fit, in set-local px. Default: this trace's own.
   *
   * A row of plots that are meant to be compared — the Moves page's figures —
   * passes the widest reach of the lot, so a figure that stays home draws small
   * beside one that travels instead of being blown up to match it.
   */
  reach?: number;
}

/** A pen plot's side, and the size a Moves row draws one at. */
export const PEN_PLOT_SIDE = 220;

/** The blank margin a pen plot leaves around its ink, px. */
export const PEN_PLOT_PAD = 14;

/**
 * The most a plot ever magnifies the floor.
 *
 * A figure that barely moves would otherwise be blown up until its wobble
 * looked like travel.
 */
export const MAX_PEN_PLOT_SCALE = 10;

/** How a trace's set-local px land on a plot of this size. */
export interface PenPlotMap {
  cx: number;
  cy: number;
  scale: number;
  /** The floor, with no pen nudged anywhere. */
  map: (sample: TraceViewPen["samples"][number]) => Vec2;
  /** The floor as one pen of `count` draws it, nudged by the spread. */
  penMap: (
    pen: TraceViewPen,
    index: number,
    draw: TraceDraw,
    count: number,
  ) => (sample: TraceViewPen["samples"][number]) => Vec2;
}

/**
 * The mapping a pen plot of this size uses.
 *
 * One scale for both axes, so a set never draws stretched, but the *fit* is per
 * axis: a box wider than it is tall is filled by a set that is wider than it is
 * tall. Pass `reach` to fit both axes to the same number instead, which is what
 * a column of plots that are meant to be compared wants.
 */
export function penPlotMap(
  trace: TraceView,
  width: number,
  height: number,
  pad: number,
  reach?: number,
): PenPlotMap {
  const fitX = Math.max(reach ?? trace.extent.x, 1);
  const fitY = Math.max(reach ?? trace.extent.y, 1);
  const scale = Math.min(
    MAX_PEN_PLOT_SCALE,
    (width - 2 * pad) / (2 * fitX),
    (height - 2 * pad) / (2 * fitY),
  );
  const cx = width / 2;
  const cy = height / 2;
  const map = (sample: TraceViewPen["samples"][number]): Vec2 => [
    cx + sample.p[0] * scale,
    cy + sample.p[1] * scale,
  ];
  return {
    cx,
    cy,
    scale,
    map,
    penMap: (_pen, index, draw, count) => {
      const [dx, dy] = spreadOffset(draw, index, count);
      return (sample) => {
        const at = map(sample);
        return [at[0] + dx, at[1] + dy];
      };
    },
  };
}

/**
 * Where the dancers started, drawn faintly: a box round their home places, a
 * dot on each, and the band's rail above the top of the set.
 *
 * Read off the trace's own first samples rather than from a formation, because
 * this package may not see one — and because the ink's own starting places are
 * what a reader wants the box around anyway.
 */
function setMarks(trace: TraceView, plot: PenPlotMap, grid: string, mark: string): string {
  const homes = trace.pens.map((pen) => pen.samples[0]).filter((s) => s !== undefined);
  if (homes.length === 0) return "";
  const xs = homes.map((s) => s.p[0]);
  const ys = homes.map((s) => s.p[1]);
  const left = plot.cx + Math.min(...xs) * plot.scale;
  const right = plot.cx + Math.max(...xs) * plot.scale;
  const top = plot.cy + Math.min(...ys) * plot.scale;
  const bottom = plot.cy + Math.max(...ys) * plot.scale;
  const parts = [box(left, top, right - left, bottom - top, grid)];
  for (const home of homes) parts.push(dot(plot.map(home), 1.2, mark));
  const rail = Math.max(2, top - BAND_RAIL_GAP_PX);
  parts.push(line([left, rail], [right, rail], mark, 1.5));
  return parts.join("");
}

/** How far above the top of the set the band's rail is drawn, px. */
export const BAND_RAIL_GAP_PX = 8;
