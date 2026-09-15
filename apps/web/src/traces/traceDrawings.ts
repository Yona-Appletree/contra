import type { Trace } from "@caller/choreo";
import type { FacingStyle } from "@caller/hall";
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

/**
 * `?facing=<style>` from the URL, or `undefined` when the query is absent or
 * names something that isn't one of the three styles.
 *
 * One parser shared by the Moves page and the traces view. `undefined` rather
 * than a style of its own, so that the default lives in exactly one place —
 * the renderer's, which is the wake since T5 — and the address bar can only
 * ever override it, never restate it.
 */
export function facingFromQuery(param: string | null): FacingStyle | undefined {
  return param === "wake" || param === "arrowheads" || param === "ticks" ? param : undefined;
}

/**
 * `?wrap=<0|1>` from the URL, or `undefined` when the query is absent or
 * names anything else.
 *
 * `undefined` rather than a default of its own, exactly like
 * {@link facingFromQuery}: the default (wrapped, T6) lives in
 * `danceTrace.ts`, and the address bar only ever overrides it — a dance
 * route's `?wrap=0` is the live comparison against the fixed-frame trace a
 * figure keeps.
 */
export function wrapFromQuery(param: string | null): boolean | undefined {
  return param === "0" ? false : param === "1" ? true : undefined;
}

/**
 * The three views a Moves row's trace panel can switch between (T4): the pen
 * plot T2 shipped, plus the march and the seismograph the per-figure traces
 * page also draws. The figure-strip cell is not one of the three — it stays
 * in the row as its own thing, always shown, switch or no switch.
 */
export type RowTraceView = "plot" | "march" | "seismograph";

/**
 * `?view=<kind>` from the URL, or the default (`"plot"`, T2's shipped look)
 * when the query is absent or names something that isn't one of the three.
 *
 * Read once, at mount, exactly like `zoom`/`speed`/`trails` on the Moves page:
 * a deep link can open on `march` or `seismograph`, and the switch itself is
 * plain React state afterwards rather than something that keeps rewriting the
 * address bar.
 */
export function viewFromQuery(param: string | null): RowTraceView {
  return param === "march" || param === "seismograph" ? param : "plot";
}

/**
 * All four, at reading size: the traces page, and every exported file.
 *
 * `facing` only reaches the pen plot and the march — the seismograph and the
 * figure strip carry no facing (T3's brief keeps it that way) and their
 * options don't accept the field.
 */
export function traceDrawings(trace: Trace, title?: string, facing?: FacingStyle): TraceDrawings {
  const named = title === undefined ? {} : { title };
  return {
    pen: penPlotSvg(trace, {
      width: TRACE_PEN_SIDE,
      height: penPlotHeight(trace),
      ...named,
      facing,
    }),
    march: marchSvg(trace, { beatPx: TRACE_BEAT_PX, height: 200, facing }),
    seismograph: seismographSvg(trace, { beatPx: TRACE_BEAT_PX, height: 220 }),
    strip: figureStripSvg(trace, { beatPx: TRACE_BEAT_PX, cellHeight: 84 }),
  };
}

/**
 * How tall a full-size pen plot is: the set's own aspect, floored so that a
 * dance whose ink is all across the set still gets a box worth looking at.
 */
export function penPlotHeight(trace: Trace): number {
  const across = Math.max(trace.extent.x, 1);
  const along = Math.max(trace.extent.y, 1);
  return Math.min(
    TRACE_PEN_SIDE,
    Math.max(TRACE_PEN_MIN_HEIGHT, Math.round((TRACE_PEN_SIDE * along) / across)),
  );
}

/** No full-size pen plot is shorter than this, px. */
export const TRACE_PEN_MIN_HEIGHT = 260;

/** The pen plot beside a Moves row's tile, sized to the tile column. */
export function rowPenPlot(
  trace: Trace,
  side: number,
  reach: number,
  facing?: FacingStyle,
): string {
  return penPlotSvg(trace, {
    width: side,
    height: side,
    pad: 8,
    penWidth: 1.2,
    spreadPx: 2,
    facingPx: 3.5,
    reach,
    facing,
  });
}

/** How wide one beat is in a Moves row's switchable march or seismograph, px. */
export const ROW_BEAT_PX = 6;

/**
 * The march inside a Moves row's tile column, switched in for the pen plot
 * (T4). Sized to the same footprint the pen plot uses — `side` square — so
 * flipping the switch does not change the row's height; a figure longer than
 * the column's width scrolls inside its own box, the same convention the
 * traces page's beat-axis views already use.
 */
export function rowMarch(trace: Trace, side: number, facing?: FacingStyle): string {
  return marchSvg(trace, {
    height: side,
    beatPx: ROW_BEAT_PX,
    penWidth: 1.2,
    spreadPx: 2,
    facingPx: 3.5,
    labels: false,
    facing,
  });
}

/**
 * The seismograph inside a Moves row's tile column, switched in for the pen
 * plot (T4). No facing — the seismograph never carries one (T2's ruling) —
 * and no axis labels: there is no room for "across"/"along" in a 136 px
 * column, and the switch itself, plus the reading guide on the per-figure
 * traces page, say which lane is which.
 */
export function rowSeismograph(trace: Trace, side: number): string {
  return seismographSvg(trace, {
    height: side,
    beatPx: ROW_BEAT_PX,
    penWidth: 1.2,
    spreadPx: 2,
    padLeft: 4,
    padRight: 4,
    labels: false,
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
    cellHeight: 44,
    captionHeight: 13,
    penWidth: 1.1,
    spreadPx: 1.8,
  });
}

/** The blank either end of a row's strip, px. */
const ROW_STRIP_PAD = 1;

/** The pen plot on a dance card. */
export function cardPenPlot(trace: Trace, width = 300, height = 170): string {
  return penPlotSvg(trace, {
    width,
    height,
    pad: 6,
    penWidth: 1,
    spreadPx: 1.6,
    facingEvery: 2,
    facingPx: 3,
  });
}

/** How wide one beat is in the dance page's switchable march or seismograph, px. */
export const DANCE_BEAT_PX = 8;

/**
 * The march on the dance page's shapes section (U3), switched in for the pen
 * plot exactly as T4's row switch does — same footprint, a card's height, so
 * flipping the switch does not change the section's height. A dance longer
 * than the page's width scrolls inside its own box, same convention as
 * everywhere else a beat axis is drawn.
 */
export function cardMarch(trace: Trace, height = 170): string {
  return marchSvg(trace, {
    height,
    beatPx: DANCE_BEAT_PX,
    penWidth: 1,
    spreadPx: 1.6,
    facingPx: 3,
    labels: false,
  });
}

/**
 * The seismograph on the dance page's shapes section (U3), switched in for the
 * pen plot. No facing — the seismograph never carries one (T2's ruling).
 */
export function cardSeismograph(trace: Trace, height = 170): string {
  return seismographSvg(trace, {
    height,
    beatPx: DANCE_BEAT_PX,
    penWidth: 1,
    spreadPx: 1.6,
    padLeft: 24,
    padRight: 8,
    labels: false,
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
    cellHeight: 36,
    labels: false,
    penWidth: 1,
    spreadPx: 1.6,
  });
}
