import type { Trace } from "@caller/choreo";
import { figureStripSvg, marchSvg, penPlotSvg, seismographSvg } from "@caller/hall";

/**
 * The three sizes the four drawings are wanted at, in one place.
 *
 * A Moves row draws a figure beside its tile, a dance card draws a whole time
 * through beside the card, and the traces page (and the exported files) draw
 * all four at reading size. The renderers themselves take every number as an
 * option; these are the numbers this app picked, so the page, the card and the
 * committed SVGs cannot drift apart.
 */
export interface TraceDrawings {
  pen: string;
  march: string;
  seismograph: string;
  strip: string;
}

/** How wide one beat is on the full-size beat axis, px. */
export const TRACE_BEAT_PX = 14;

/** The side of a full-size pen plot, px. */
export const TRACE_PEN_SIDE = 480;

/** All four, at reading size: the traces page, and every exported file. */
export function traceDrawings(trace: Trace, title?: string): TraceDrawings {
  const named = title === undefined ? {} : { title };
  return {
    pen: penPlotSvg(trace, { width: TRACE_PEN_SIDE, height: TRACE_PEN_SIDE, ...named }),
    march: marchSvg(trace, { beatPx: TRACE_BEAT_PX, height: 200 }),
    seismograph: seismographSvg(trace, { beatPx: TRACE_BEAT_PX, height: 220 }),
    strip: figureStripSvg(trace, { beatPx: TRACE_BEAT_PX, cellHeight: 84 }),
  };
}

/** The pen plot beside a Moves row's tile, sized to the tile column. */
export function rowPenPlot(trace: Trace, side: number, reach: number): string {
  return penPlotSvg(trace, {
    width: side,
    height: side,
    pad: 8,
    penWidth: 1.2,
    spreadPx: 2,
    facingPx: 3.5,
    reach,
  });
}

/**
 * The one-line figure strip under a Moves row's tile.
 *
 * Its beat axis is stretched to the tile column rather than fixed, because a
 * row's window is anywhere from four to thirty-two beats and a fixed beat width
 * would make half the rows a sliver and the other half overflow.
 */
export function rowStrip(trace: Trace, width: number): string {
  const beats = Math.max(1, trace.to - trace.from);
  return figureStripSvg(trace, {
    beatPx: (width - 2 * ROW_STRIP_PAD) / beats,
    padLeft: ROW_STRIP_PAD,
    padRight: ROW_STRIP_PAD,
    cellHeight: 30,
    captionHeight: 13,
    penWidth: 1.1,
    spreadPx: 1.8,
  });
}

/** The blank either end of a row's strip, px. */
const ROW_STRIP_PAD = 1;

/** The pen plot on a dance card. */
export function cardPenPlot(trace: Trace, side = 132): string {
  return penPlotSvg(trace, {
    width: side,
    height: side,
    pad: 6,
    penWidth: 1,
    spreadPx: 1.6,
    facingEvery: 2,
    facingPx: 3,
  });
}

/**
 * The figure strip on a dance card: sixty-four beats in a card's width, so the
 * captions are dropped and the cells are read by colour and by shape.
 */
export function cardStrip(trace: Trace, width = 300): string {
  const beats = Math.max(1, trace.to - trace.from);
  return figureStripSvg(trace, {
    beatPx: (width - 2 * ROW_STRIP_PAD) / beats,
    padLeft: ROW_STRIP_PAD,
    padRight: ROW_STRIP_PAD,
    cellHeight: 34,
    labels: false,
    penWidth: 1,
    spreadPx: 1.6,
  });
}
