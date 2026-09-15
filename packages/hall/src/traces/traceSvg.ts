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

/**
 * How a pen's facing is drawn on the pen plot and the march.
 *
 * `"wake"` is the user's idea and, since T5, the default: a soft band on the
 * facing side of the whole path, not a mark at a beat. `"ticks"` is what
 * shipped in T2 — a short line out of the path every `facingEvery` beats —
 * and `"arrowheads"` swaps the tick for a small triangle once a phrase
 * (`phraseBeats`, default 16) instead of every beat. Both remain reachable,
 * in code and from `?facing=` in the address bar. The three are compared in
 * `apps/web/e2e/screenshots/t3-facing-*.png` (T3, the pick) and
 * `t5-wake-*.png` (T5, the tuning).
 */
export type FacingStyle = "ticks" | "wake" | "arrowheads";

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
   * `0` turns them off. Only read by `"ticks"`; `"wake"` draws from every
   * sample regardless, and `"arrowheads"` uses `phraseBeats` instead.
   */
  facingEvery?: Beat;
  /**
   * How long a facing tick is, px, or how long an arrowhead is. Default 4.
   * The wake has its own, wider reach ({@link TraceDrawOptions.wakePx}); a
   * margin is computed from {@link facingReach}, which gives whichever of the
   * two the style being drawn actually uses.
   */
  facingPx?: number;
  /**
   * How far a wake reaches out of the line, px. Default six times `penWidth`
   * — 7.2 px at the Moves row's own pen, 8.4 px at the default one — which is
   * what makes it read as a fade rather than a hairline (T5, the user's
   * "the fade is too narrow, hard to see").
   */
  wakePx?: number;
  /**
   * How opaque a wake is where it leaves the line, 0…1. Default 0.65, which
   * the blur that does the fading turns into about 0.6 at the line itself and
   * 0.03 at the reach.
   */
  wakeOpacity?: number;
  /** Which way a pen's facing is drawn. Default `"wake"` since T5. */
  facing?: FacingStyle;
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
  wakePx: number;
  wakeOpacity: number;
  facing: FacingStyle;
}

/** Fill in every default a drawing needs. */
export function traceDraw(options: TraceDrawOptions = {}): TraceDraw {
  const penWidth = options.penWidth ?? TRACE_PEN_WIDTH;
  return {
    palette: options.palette ?? TRACE_PALETTE,
    penWidth,
    phraseBeats: options.phraseBeats ?? 16,
    labels: options.labels ?? true,
    nameOf: options.nameOf ?? ((figure: string) => figure),
    colourOf: options.colourOf ?? familyColour,
    title: options.title,
    spread: options.spread ?? "diagonal",
    spreadPx: options.spreadPx ?? 2.4,
    facingEvery: options.facingEvery ?? 1,
    facingPx: options.facingPx ?? 4,
    wakePx: options.wakePx ?? penWidth * WAKE_REACH_PER_PEN_WIDTH,
    wakeOpacity: options.wakeOpacity ?? WAKE_OPACITY,
    facing: options.facing ?? "wake",
  };
}

/** How thick a pen draws when nobody says otherwise, px. */
export const TRACE_PEN_WIDTH = 1.4;

/**
 * How far a wake reaches out of the line, as a multiple of the pen's own
 * stroke width.
 *
 * The pen's width is the one number every caller already scales with the plot
 * — 1.2 px in a Moves row, 1.4 px on the traces page, 1 px on a dance card —
 * so hanging the wake off it is what makes a wake on a row and a wake at
 * reading size look like the same drawing at two sizes. Six, not the three
 * the milestone's brief guessed at: three is 3.6 px at the row's own pen,
 * which is the 3.5 px T3 already drew and the user called too narrow to see.
 * The pictures that settled it are `apps/web/e2e/screenshots/t5-wake-reach-*.png`.
 */
export const WAKE_REACH_PER_PEN_WIDTH = 6;

/** How opaque a wake is where it leaves the line, before the fade. */
export const WAKE_OPACITY = 0.65;

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
 * How far out of the path the style being drawn reaches, px: a tick's tip and
 * an arrowhead's point sit `facingPx` out, a wake's far edge `wakePx`.
 *
 * The pen plot's and the march's margins are computed from this, so whichever
 * style is asked for, the widest thing on the page still fits.
 */
export function facingReach(draw: TraceDraw): number {
  return draw.facing === "wake" ? draw.wakePx : draw.facingPx;
}

/**
 * Draws a pen's facing in whichever of the three styles `draw.facing` names.
 *
 * The three styles share one call site in `penPlotSvg` and `marchSvg`, at
 * exactly the point T2 called {@link facingTicks} — so the default style,
 * `"ticks"`, forwards to the untouched T2 function with the untouched
 * arguments, in the untouched position in the drawing's own string
 * concatenation. That is what keeps every committed plate, strip and
 * exported trace byte-identical until somebody actually asks for a
 * different style: nothing about this milestone's own code path runs unless
 * `facing` is `"wake"` or `"arrowheads"`.
 */
export function facingMarks(
  pen: TraceViewPen,
  penIndex: number,
  map: (sample: TraceViewPen["samples"][number]) => Vec2,
  draw: TraceDraw,
  stroke: string,
): string {
  if (draw.facing === "wake") return facingWake(pen, penIndex, map, draw, stroke);
  if (draw.facing === "arrowheads") return facingArrowheads(pen, map, draw, stroke);
  return facingTicks(pen, map, draw, stroke);
}

/**
 * The user's wake: instead of a mark once a beat, a continuous band running
 * the whole path on the facing side of the line, the pen's own colour at the
 * line fading to nothing `wakePx` out.
 *
 * T3 built this from one gradient-filled quad per consecutive pair of
 * samples, and the user's verdict on it was "it looks kinda jagged, and the
 * fade is too narrow, hard to see". Both halves of that are built out here.
 *
 * **One ribbon per pen, not a quad per sample.** Each run of unbroken ink
 * gets one open path — the *centre line* of the band, half a reach out from
 * the ink along the facing — stroked `wakePx` wide with round caps and round
 * joins. A stroke is one painted shape however much it doubles back on
 * itself, so a turn that swings the band across its own tail paints exactly
 * once (the `fill-rule: nonzero`, single-opacity requirement, got by
 * construction rather than by a rule), and a round join means the outer edge
 * of a turn is a circular arc rather than the staircase of quad corners that
 * made T3's edge jagged. The one number that still has to be smooth is the
 * centre line itself, so the facing it is built from is a weighted moving
 * average of the neighbouring samples' facing *vectors*
 * ({@link smoothFacings}) — averaging directions, never degrees, so that a
 * pen crossing due north does not swing the long way round through 359.
 *
 * **The fade is a blur, not a gradient.** A linear gradient paints along one
 * fixed direction, and the direction this band fades in turns with the
 * dancer; T3 answered that with a gradient per quad, which is what put a seam
 * at every sample. Instead the band is one flat colour, masked by the ink's
 * own path stroked `wakePx` wide in white and blurred: the mask's value is
 * then a smooth function of the distance from the line — about 0.9 at the
 * line, 0.5 half way out, 0.05 at the reach — which is the fade the user
 * asked for, with no direction of its own to go wrong and no seam anywhere.
 * Times `wakeOpacity`, that is ~0.6 at the line falling to ~0.03 at the
 * reach. Nothing fades to black: the band is painted only where the mask
 * lets it through, so two pens crossing both keep showing, which is why the
 * wake survived T3's crossing test and why it still does.
 *
 * The ids are hashed from the path data because these SVGs are inlined into
 * one HTML document — a Moves page holds a hundred of them — and `url(#…)`
 * finds the *first* element with an id in the document. A fixed id would have
 * pointed every row's mask at the first row's.
 */
function facingWake(
  pen: TraceViewPen,
  penIndex: number,
  map: (sample: TraceViewPen["samples"][number]) => Vec2,
  draw: TraceDraw,
  stroke: string,
): string {
  const reach = draw.wakePx;
  if (reach <= 0 || draw.wakeOpacity <= 0) return "";
  const runs = wakeRuns(pen, map, reach);
  if (runs.length === 0) return "";
  const ink = runs.map((run) => pathData(run.ink)).join("");
  const band = runs.map((run) => pathData(run.band)).join("");
  const blur = reach * WAKE_BLUR_OF_REACH;
  // The mask and the blur both need a region in user space: an
  // `objectBoundingBox` one is a share of a bounding box that can be a couple
  // of px tall on a straight run, which would crop the blur's own tails.
  const region = wakeRegion(runs, reach / 2 + 4 * blur);
  const id = `wk${String(penIndex)}${hashId(ink + band + num(reach))}`;
  const ends = ` stroke-width="${num(reach)}" stroke-linecap="round" stroke-linejoin="round"`;
  return (
    `<defs>` +
    `<filter id="fade-${id}" filterUnits="userSpaceOnUse"${region}>` +
    `<feGaussianBlur stdDeviation="${num(blur)}"/>` +
    `</filter>` +
    `<mask id="mask-${id}" maskUnits="userSpaceOnUse"${region}>` +
    `<path d="${ink}" fill="none" stroke="#fff"${ends} filter="url(#fade-${id})"/>` +
    `</mask>` +
    `</defs>` +
    `<g mask="url(#mask-${id})" opacity="${num(draw.wakeOpacity)}">` +
    `<path d="${band}" fill="none" stroke="${stroke}"${ends}/>` +
    `</g>`
  );
}

/**
 * How wide the blur that fades a wake is, as a fraction of the reach.
 *
 * The mask is a strip of half-width `reach / 2` blurred by this much, so the
 * value at distance `d` from the line is the blur of that strip: 0.9 at the
 * line, 0.5 at `reach / 2`, 0.05 at `reach`. Wider and the band leaks past
 * its own margin; narrower and the fade shortens back towards the hard-edged
 * stripe this is here to avoid.
 */
const WAKE_BLUR_OF_REACH = 0.3;

/** A pen's ink and the centre line of its wake, one pair per unbroken run. */
interface WakeRun {
  /** The ink, exactly as the pen plot draws it. */
  ink: Vec2[];
  /** Half a reach out from the ink, along the smoothed facing. */
  band: Vec2[];
}

/**
 * One pen's samples as runs of ink and band, broken where the ink breaks.
 *
 * The same jump test the ink itself takes ({@link inkRuns}): no band across a
 * gap no pair of feet could have walked, or a progression would hang a band
 * across the whole set. A wrap (T6) breaks it the same way the ink breaks
 * with it — the wake is drawn off the ink, so it cannot span a fold the ink
 * itself does not.
 */
function wakeRuns(
  pen: TraceViewPen,
  map: (sample: TraceViewPen["samples"][number]) => Vec2,
  reach: number,
): WakeRun[] {
  const runs: WakeRun[] = [];
  let run: TraceViewPen["samples"][number][] = [];
  const flush = (): void => {
    if (run.length > 1) runs.push(wakeRun(run, map, reach));
    run = [];
  };
  let previous: TraceViewPen["samples"][number] | undefined;
  for (const sample of pen.samples) {
    if (
      previous !== undefined &&
      (sample.wrapped === true ||
        Math.hypot(sample.p[0] - previous.p[0], sample.p[1] - previous.p[1]) > TRACE_JUMP_PX)
    ) {
      flush();
    }
    run.push(sample);
    previous = sample;
  }
  flush();
  return runs;
}

/** One unbroken run: the mapped ink, and the band's centre line beside it. */
function wakeRun(
  samples: readonly TraceViewPen["samples"][number][],
  map: (sample: TraceViewPen["samples"][number]) => Vec2,
  reach: number,
): WakeRun {
  const ink = samples.map(map);
  const facings = smoothFacings(samples.map((sample) => sample.facing));
  const band = ink.map((at, i) => {
    const unit = facings[i]!;
    return [at[0] + (unit[0] * reach) / 2, at[1] + (unit[1] * reach) / 2] as Vec2;
  });
  return { ink, band };
}

/**
 * The facings a wake is drawn from: each sample's own, averaged with its
 * neighbours' as unit vectors and renormalised.
 *
 * The simulation's facing moves by up to 28° between two samples an eighth of
 * a beat apart — a swing really does spin that fast — and half of that is the
 * dancer's own quiet wobble rather than the turn. Drawn straight, the band's
 * centre line wobbles with it and the outer edge of the band steps: the
 * "jagged" the user saw. A five-sample triangular window (±0.25 beat at the
 * sampler's own step) takes the wobble out and leaves the turn, because an
 * average of directions still turns at the rate a real turn turns — it only
 * loses what changes faster than the window.
 *
 * Averaging the vectors, not the angles, is what makes a pen facing 359° and
 * one facing 1° average to 0° instead of to 180°.
 */
function smoothFacings(degrees: readonly number[]): Vec2[] {
  const units = degrees.map((angle): Vec2 => {
    const radians = (angle * Math.PI) / 180;
    return [Math.cos(radians), Math.sin(radians)];
  });
  return units.map((own, i) => {
    let x = 0;
    let y = 0;
    for (let k = -WAKE_SMOOTH_SAMPLES; k <= WAKE_SMOOTH_SAMPLES; k++) {
      const unit = units[i + k];
      if (unit === undefined) continue;
      const weight = WAKE_SMOOTH_SAMPLES + 1 - Math.abs(k);
      x += unit[0] * weight;
      y += unit[1] * weight;
    }
    const length = Math.hypot(x, y);
    // Two opposite facings inside one window cancel; keep the sample's own.
    return length < 1e-6 ? own : [x / length, y / length];
  });
}

/** How many samples either side of a sample its facing is averaged over. */
const WAKE_SMOOTH_SAMPLES = 2;

/** `x`, `y`, `width` and `height` round everything a wake draws, padded. */
function wakeRegion(runs: readonly WakeRun[], pad: number): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const run of runs) {
    for (const points of [run.ink, run.band]) {
      for (const [x, y] of points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return (
    ` x="${num(minX - pad)}" y="${num(minY - pad)}"` +
    ` width="${num(maxX - minX + 2 * pad)}" height="${num(maxY - minY + 2 * pad)}"`
  );
}

/**
 * A short, stable name for a run of path data.
 *
 * Only ever used to keep one document's ids apart, so a 32-bit FNV-1a in
 * base 36 is plenty: two drawings that hash the same are two drawings with
 * the same path data, which share a mask perfectly happily.
 */
function hashId(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** One run of points as path data, with no fill or stroke of its own. */
function pathData(points: readonly Vec2[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p[0])} ${num(p[1])}`).join("");
}

/**
 * The third candidate: one small triangle every phrase (`phraseBeats`, a
 * contra phrase's 16 beats by default) instead of a tick every beat —
 * fewer, bigger marks that read at a glance rather than a fence of ticks
 * along the whole path.
 *
 * Every vertex stays within `facingPx` of the sample, the same reach a
 * tick's own tip uses, so it needs no margin of its own either: the tip sits
 * exactly `facingPx` out (a tick's own distance) and the two back corners sit
 * closer in than that.
 */
function facingArrowheads(
  pen: TraceViewPen,
  map: (sample: TraceViewPen["samples"][number]) => Vec2,
  draw: TraceDraw,
  stroke: string,
): string {
  if (draw.phraseBeats <= 0 || draw.facingPx <= 0) return "";
  const out: string[] = [];
  for (const sample of pen.samples) {
    const beats = sample.beat / draw.phraseBeats;
    if (Math.abs(beats - Math.round(beats)) > 1e-6) continue;
    const at = map(sample);
    const radians = (sample.facing * Math.PI) / 180;
    const dir: Vec2 = [Math.cos(radians), Math.sin(radians)];
    const perp: Vec2 = [-dir[1], dir[0]];
    const tip: Vec2 = [at[0] + dir[0] * draw.facingPx, at[1] + dir[1] * draw.facingPx];
    const backX = at[0] + dir[0] * draw.facingPx * 0.55;
    const backY = at[1] + dir[1] * draw.facingPx * 0.55;
    const wing = draw.facingPx * 0.4;
    const left: Vec2 = [backX + perp[0] * wing, backY + perp[1] * wing];
    const right: Vec2 = [backX - perp[0] * wing, backY - perp[1] * wing];
    out.push(
      `<path d="M${num(left[0])} ${num(left[1])}L${num(tip[0])} ${num(tip[1])}` +
        `L${num(right[0])} ${num(right[1])}Z" fill="${stroke}"/>`,
    );
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
  const d = pathData(points);
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
 * mapped point, or the march would break on every step it takes. A sample's
 * own {@link TraceViewPen.samples}' `wrapped` flag (T6) breaks the run too,
 * whether or not the fold happens to also be a jump — a dancer easing to a
 * stop right at the fold barely moves at all in the folded picture, and the
 * ink still should not stitch the two laps together.
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
      (sample.wrapped === true ||
        Math.hypot(sample.p[0] - previous.p[0], sample.p[1] - previous.p[1]) > TRACE_JUMP_PX);
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
