import type { Beat, Vec2 } from "@caller/core";
import type { TracePalette, TraceView, TraceViewPen } from "./TraceView.js";
import { TRACE_PALETTE, familyColour, penColour } from "./TraceView.js";

/**
 * The SVG the four trace drawings share: one document, one ground, and the
 * handful of primitives each of them lays on it.
 *
 * SVG rather than canvas because these are meant to be looked at large, printed
 * and pasted into a post, and because a string is easy to make deterministic:
 * every number goes through {@link num}, every drawing walks its pens in the
 * order the trace lists them, and nothing reads a clock or a random source. The
 * same trace gives the same bytes.
 */
export function traceSvg(width: number, height: number, body: string, ground: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(width)} ${num(height)}"`,
    ` width="${num(width)}" height="${num(height)}" role="img">`,
    `<rect width="${num(width)}" height="${num(height)}" fill="${ground}"/>`,
    body,
    `</svg>`,
  ].join("");
}

/** How far two samples may be apart, in set-local px, before the ink breaks. */
export const TRACE_JUMP_PX = 12;

/**
 * Which way the pens are nudged apart so the last one drawn does not bury the
 * other three.
 *
 * Four dancers walking one figure often walk the same line — the two larks of a
 * pass through are on the same track to within a pixel — and one flat colour
 * drawn over another is a lie about who was there. A pen's whole path is
 * shifted by a fixed screen-space offset, the same offset for the whole
 * drawing, so the shape is unchanged and the four tracks stay separable.
 */
export type TraceSpread = "diagonal" | "horizontal" | "vertical" | "none";

/** Everything all four drawings take. */
export interface TraceDrawOptions {
  palette?: TracePalette;
  /** How thick the pens draw, px. */
  penWidth?: number;
  /** Beats between phrase rules. Default 16, a contra phrase. */
  phraseBeats?: Beat;
  /** Draw axis labels, phrase letters and cell captions. Default true. */
  labels?: boolean;
  /** What to call a figure under a strip cell. Default: its id. */
  nameOf?: (figure: string) => string;
  /** What colour a strip cell is washed in. Default {@link familyColour}. */
  colourOf?: (family: string) => string;
  /** A line of text in the top-left corner. */
  title?: string;
  /** Which way to nudge the pens apart. Default `"diagonal"`. */
  spread?: TraceSpread;
  /** How far apart consecutive pens are nudged, px. Default 2.4. */
  spreadPx?: number;
  /**
   * How often a facing tick is drawn, in beats. Default 1 — one tick a beat.
   * `0` turns them off.
   */
  facingEvery?: Beat;
  /** How long a facing tick is, px. Default 4. */
  facingPx?: number;
}

/** The options with their defaults filled in. */
export interface TraceDraw {
  palette: TracePalette;
  penWidth: number;
  phraseBeats: Beat;
  labels: boolean;
  nameOf: (figure: string) => string;
  colourOf: (family: string) => string;
  title: string | undefined;
  spread: TraceSpread;
  spreadPx: number;
  facingEvery: Beat;
  facingPx: number;
}

/** Fill in every default a drawing needs. */
export function traceDraw(options: TraceDrawOptions = {}): TraceDraw {
  return {
    palette: options.palette ?? TRACE_PALETTE,
    penWidth: options.penWidth ?? 1.4,
    phraseBeats: options.phraseBeats ?? 16,
    labels: options.labels ?? true,
    nameOf: options.nameOf ?? ((figure: string) => figure),
    colourOf: options.colourOf ?? familyColour,
    title: options.title,
    spread: options.spread ?? "diagonal",
    spreadPx: options.spreadPx ?? 2.4,
    facingEvery: options.facingEvery ?? 1,
    facingPx: options.facingPx ?? 4,
  };
}

/** The unit vector a spread nudges along. */
const SPREAD_UNITS: Record<TraceSpread, Vec2> = {
  diagonal: [Math.SQRT1_2, Math.SQRT1_2],
  horizontal: [1, 0],
  vertical: [0, 1],
  none: [0, 0],
};

/** How far pen `index` of `count` is nudged, in screen px. */
export function spreadOffset(draw: TraceDraw, index: number, count: number): Vec2 {
  const unit = SPREAD_UNITS[draw.spread];
  const step = (index - (count - 1) / 2) * draw.spreadPx;
  return [unit[0] * step, unit[1] * step];
}

/**
 * Short ticks along a pen's path, one per `facingEvery` beats, pointing the way
 * the dancer faced.
 *
 * The community's complaint about the exploration post's plates was that a
 * track with no facing on it cannot tell you whether a dance flows: a pass
 * through walked forwards and a pass through walked backwards draw the same
 * line. The simulation knows the facing at every sample, so the plot says it.
 *
 * Only the two views with a floor in them get ticks. On the seismograph an axis
 * is position against time and a direction on the floor has nowhere to point;
 * on the strip the cells are too small to carry one.
 */
export function facingTicks(
  pen: TraceViewPen,
  map: (sample: TraceViewPen["samples"][number]) => Vec2,
  draw: TraceDraw,
  stroke: string,
): string {
  if (draw.facingEvery <= 0) return "";
  const out: string[] = [];
  for (const sample of pen.samples) {
    const beats = sample.beat / draw.facingEvery;
    if (Math.abs(beats - Math.round(beats)) > 1e-6) continue;
    const at = map(sample);
    const radians = (sample.facing * Math.PI) / 180;
    const tip: Vec2 = [
      at[0] + Math.cos(radians) * draw.facingPx,
      at[1] + Math.sin(radians) * draw.facingPx,
    ];
    out.push(line(at, tip, stroke, draw.penWidth * 0.75));
  }
  return out.join("");
}

/**
 * A number, rounded to hundredths and written the one way.
 *
 * Two decimals is finer than any pen this draws with and coarse enough that
 * floating-point noise in the last place never reaches the file, which is what
 * makes "the same timeline gives the same SVG bytes" true rather than hopeful.
 */
export function num(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Text, safe to drop between two SVG tags. */
export function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One straight line. */
export function line(a: Vec2, b: Vec2, stroke: string, width = 1): string {
  return (
    `<path d="M${num(a[0])} ${num(a[1])}L${num(b[0])} ${num(b[1])}"` +
    ` stroke="${stroke}" stroke-width="${num(width)}" fill="none"/>`
  );
}

/** One open rectangle. */
export function box(x: number, y: number, w: number, h: number, stroke: string): string {
  return (
    `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"` +
    ` fill="none" stroke="${stroke}" stroke-width="1"/>`
  );
}

/** One filled dot. */
export function dot(p: Vec2, r: number, fill: string): string {
  return `<circle cx="${num(p[0])}" cy="${num(p[1])}" r="${num(r)}" fill="${fill}"/>`;
}

/** One run of ink. */
export function polyline(points: readonly Vec2[], stroke: string, width: number): string {
  if (points.length < 2) return "";
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p[0])} ${num(p[1])}`).join("");
  return (
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${num(width)}"` +
    ` stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** One line of text. */
export function label(
  p: Vec2,
  text: string,
  fill: string,
  size = 9,
  anchor: "start" | "middle" | "end" = "start",
): string {
  return (
    `<text x="${num(p[0])}" y="${num(p[1])}" fill="${fill}" font-size="${num(size)}"` +
    ` font-family="ui-monospace, Menlo, monospace"` +
    (anchor === "start" ? "" : ` text-anchor="${anchor}"`) +
    `>${escapeText(text)}</text>`
  );
}

/** The pen's colour, from its role and its rank. */
export const inkOf = (pen: TraceViewPen): string => penColour(pen.role, pen.rank);

/** What a run of ink is filtered to. */
export interface InkOptions {
  /** Only the samples this span owns. */
  span?: number;
  /** Only the samples inside this half-open beat window. */
  window?: { from: Beat; to: Beat };
}

/**
 * One pen's path, as runs of points, broken wherever the ink should break: at a
 * filtered-out sample, and at a jump no pair of feet could have walked.
 *
 * `map` is what makes the four drawings four drawings: the pen plot maps a
 * sample to the floor, the march adds the beat to `x`, and the seismograph
 * throws one axis away. The jump test is on the *floor* position, never on the
 * mapped point, or the march would break on every step it takes.
 */
export function inkRuns(
  pen: TraceViewPen,
  map: (sample: TraceViewPen["samples"][number]) => Vec2,
  options: InkOptions = {},
): Vec2[][] {
  const runs: Vec2[][] = [];
  let run: Vec2[] = [];
  let previous: TraceViewPen["samples"][number] | undefined;
  for (const sample of pen.samples) {
    const wanted =
      (options.span === undefined || sample.span === options.span) &&
      (options.window === undefined ||
        (sample.beat >= options.window.from - 1e-9 && sample.beat <= options.window.to + 1e-9));
    const jumped =
      previous !== undefined &&
      Math.hypot(sample.p[0] - previous.p[0], sample.p[1] - previous.p[1]) > TRACE_JUMP_PX;
    if (!wanted || jumped) {
      if (run.length > 1) runs.push(run);
      run = [];
      previous = wanted ? sample : undefined;
      if (wanted) run.push(map(sample));
      continue;
    }
    run.push(map(sample));
    previous = sample;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** How far the ink reaches, never zero, so a still figure still gets a scale. */
export function traceExtent(trace: TraceView): { x: number; y: number } {
  return { x: Math.max(trace.extent.x, 1), y: Math.max(trace.extent.y, 1) };
}

/** The beat rules a drawing with a beat axis puts down, phrase lines first. */
export function beatRules(
  trace: TraceView,
  draw: TraceDraw,
  x: (beat: Beat) => number,
  top: number,
  bottom: number,
): string {
  const out: string[] = [];
  const first = Math.ceil(trace.from / 4) * 4;
  for (let beat = first; beat <= trace.to + 1e-9; beat += 4) {
    const phrase = (beat - trace.from) % draw.phraseBeats === 0;
    out.push(
      line(
        [x(beat), phrase ? top : (top + bottom) / 2 - 2],
        [x(beat), phrase ? bottom : (top + bottom) / 2 + 2],
        phrase ? draw.palette.rule : draw.palette.grid,
        1,
      ),
    );
  }
  return out.join("");
}

/** `A1`, `A2`, `B1`, `B2`, then `+64`, `+80`, … for a trace that runs longer. */
export function phraseName(index: number): string {
  const names = ["A1", "A2", "B1", "B2"];
  return names[index] ?? `+${String(index * 16)}`;
}
